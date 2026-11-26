import { useEffect, useRef, useState } from 'react';
import { getExtrasMeta, saveExtrasMeta } from '../lib/lightsStore';

// Quoter → Offers step (right before Present):
//  • Bonus gallery — tap to add. Free bonuses show in the Hey Jude's box on the Present page with a FREE
//    tag (and a $0 line on the Jobber quote). Money-off offers come off the price quietly (Jude says them)
//    and go on the Jobber quote as a 🎁 minus line.
//  • Price bump — $0 by default, +$50 / +$100 / +$200, folded into the roofline price.
// Saved in lq-ba:<id>: { perks: [{ cat, title, sub }], offers: [{ id, cat, label, amount, kind, when, on }], adjust }

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const newId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Only things we can always deliver — no timing promises.
const BONUSES = [
  { cat: 'wreath', icon: '🎄', bg: 'from-emerald-700 to-emerald-950', type: 'free', title: 'Free 24" lit wreath', sub: 'Hung on your front door — a $250 value', tag: '$250 value' },
  { cat: 'gutter', icon: '🍂', bg: 'from-amber-600 to-orange-950', type: 'free', title: 'Free gutter cleaning', sub: 'We clean the gutters where we install your lights when we take them down, since we’re already up there — a $150 value, free', tag: '$150 value' },
  { cat: 'garland', icon: '🌲', bg: 'from-green-700 to-green-950', type: 'free', title: 'Free lit garland', sub: 'On your front door or railing — a $180 value', tag: '$180 value' },
  { cat: 'bush', icon: '🌿', bg: 'from-lime-700 to-lime-950', type: 'free', title: 'Free bush wrap', sub: 'One bush by the door, wrapped in lights — a $40 value', tag: '$40 value' },
  { cat: 'photo', icon: '📸', bg: 'from-indigo-700 to-indigo-950', type: 'free', title: 'Free night photo', sub: 'A pro photo of your home all lit up — yours to keep and share', tag: 'Keepsake' },
  { cat: 'tonight', icon: '⏰', bg: 'from-red-700 to-red-950', type: 'off', amount: 200, when: 'today', title: 'Book tonight', sub: '$200 off when you book today', tag: '−$200' },
  { cat: 'neighbor', icon: '🏡', bg: 'from-sky-700 to-sky-950', type: 'off', amount: 100, when: 'always', title: 'Neighbor discount', sub: '$100 off — a neighbor already uses us', tag: '−$100' },
  { cat: 'referred', icon: '🎁', bg: 'from-fuchsia-700 to-fuchsia-950', type: 'off', amount: 50, when: 'always', title: 'Referred by a friend', sub: '$50 off from our Give $50 + Get $50', tag: '−$50' },
];
const BUMPS = [0, 50, 100, 200];
const plain = (t) => String(t || '').replace(/^[^\w"]+\s*/u, '').toLowerCase();

export default function LightsOffers({ quoteId, basePrice = 0 }) {
  const [v, setV] = useState(null); // { adjust, offers, perks } — null = loading
  const [status, setStatus] = useState('');
  const ref = useRef({ adjust: 0, offers: [], perks: [] });
  const loaded = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!quoteId) return undefined;
    let off = false;
    getExtrasMeta(quoteId).then((d) => {
      if (off) return;
      // The old "Free 24" lit wreath" free-item offer becomes the wreath bonus.
      const offers = (Array.isArray(d.offers) ? d.offers : []).filter((o) => o.kind !== 'free');
      const perks = Array.isArray(d.perks) ? [...d.perks] : [];
      if ((d.offers || []).some((o) => o.kind === 'free' && /wreath/i.test(o.label || '') && o.on !== false) && !perks.some((p) => p.cat === 'wreath')) {
        perks.push({ cat: 'wreath', title: '🎄 Free 24" lit wreath', sub: BONUSES[0].sub });
      }
      ref.current = { adjust: Number(d.adjust) || 0, offers, perks };
      setV(ref.current); loaded.current = true;
    }).catch(() => { if (!off) { setV(ref.current); setStatus('Could not load offers'); } });
    return () => { off = true; };
  }, [quoteId]);

  const update = (patch) => {
    ref.current = { ...ref.current, ...patch };
    setV(ref.current);
    if (!loaded.current) return;
    setStatus('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveExtrasMeta(quoteId, ref.current).then(() => setStatus('Saved')).catch(() => setStatus('Not saved — check connection'));
    }, 600);
  };

  if (!quoteId) return <p className="text-sm text-muted">Pick the client first so the quote saves.</p>;
  if (!v) return <p className="text-sm text-muted">Loading…</p>;

  // Free bonus = in perks; money off = in offers (switched on). Older entries match by name.
  const samePerk = (b) => (p) => p.cat === b.cat || plain(p.title) === plain(b.title) || plain(b.title).endsWith(plain(p.title));
  const sameOffer = (b) => (o) => o.cat === b.cat || o.label === b.title;
  const isOn = (b) => (b.type === 'free' ? v.perks.some(samePerk(b)) : v.offers.some((o) => sameOffer(b)(o) && o.on !== false));
  const toggle = (b) => {
    const on = isOn(b);
    if (b.type === 'free') update({ perks: on ? v.perks.filter((p) => !samePerk(b)(p)) : [...v.perks, { cat: b.cat, title: `${b.icon} ${b.title}`, sub: b.sub }] });
    else update({ offers: on ? v.offers.filter((o) => !sameOffer(b)(o)) : [...v.offers.filter((o) => !sameOffer(b)(o)), { id: newId(), cat: b.cat, label: b.title, amount: b.amount, kind: '$', when: b.when, on: true }] });
  };
  const custom = v.offers.filter((o) => !BONUSES.some((b) => sameOffer(b)(o)));
  const editCustom = (id, patch) => update({ offers: v.offers.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const box = 'rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand';
  const offTotal = v.offers.filter((o) => o.on !== false && o.kind === '$').reduce((t, o) => t + (Number(o.amount) || 0), 0);

  return (
    <div className="space-y-6">
      {status && <p className={`text-xs ${/Not|Could not/.test(status) ? 'text-red-400' : 'text-muted'}`}>{status}</p>}

      {/* Bonus gallery */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-primary">Bonuses <span className="font-normal text-muted">— tap to add. Free ones show in the Hey Jude's box with a FREE tag; money-off comes off the price (you say it).</span></p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {BONUSES.map((b) => {
            const on = isOn(b);
            return (
              <button key={b.cat} onClick={() => toggle(b)}
                className={`relative text-left rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${on ? 'border-brand shadow-[0_0_24px_rgba(0,223,0,0.25)]' : 'border-border-default hover:border-border-strong opacity-80 hover:opacity-100'}`}>
                <div className={`h-20 bg-gradient-to-br ${b.bg} flex items-center justify-center text-5xl`}>{b.icon}</div>
                <div className="p-2.5 bg-card">
                  <p className="text-sm font-bold text-primary leading-tight">{b.title}</p>
                  <p className={`mt-1 text-xs font-bold ${b.type === 'off' ? 'text-red-400' : 'text-brand-text'}`}>{b.tag}{b.when === 'today' ? ' · today only' : ''}</p>
                </div>
                <span className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${on ? 'bg-brand text-on-brand' : 'bg-black/50 text-white/70'}`}>{on ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>

        {/* Custom money-off offers (anything not in the gallery) */}
        {custom.map((x) => (
          <div key={x.id} className="rounded-xl border border-border-default p-2.5 flex items-center gap-2 flex-wrap">
            <input type="checkbox" checked={x.on !== false} onChange={(e) => editCustom(x.id, { on: e.target.checked })} />
            <input value={x.label || ''} onChange={(e) => editCustom(x.id, { label: e.target.value })} placeholder="Offer name" className={`${box} flex-1 min-w-[140px] font-semibold`} />
            <span className="text-sm text-secondary">−$</span>
            <input type="number" min="0" value={x.amount ?? ''} onChange={(e) => editCustom(x.id, { amount: e.target.value === '' ? '' : Number(e.target.value), kind: '$' })} className={`${box} w-20`} />
            <button onClick={() => update({ offers: v.offers.filter((o) => o.id !== x.id) })} className="rounded-lg px-2 py-1 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer">✕</button>
          </div>
        ))}
        <button onClick={() => update({ offers: [...v.offers, { id: newId(), label: '', amount: '', kind: '$', when: 'always', on: true }] })}
          className="rounded-lg border border-dashed border-border-default px-3 py-1.5 text-sm text-secondary hover:text-primary cursor-pointer">+ Custom $ off</button>
        {offTotal > 0 && <p className="text-xs text-muted">Money off on this quote: <b className="text-primary">{money(offTotal)}</b> per season (taken off quietly — you announce it).</p>}
      </div>

      {/* Price bump */}
      <div className="space-y-2 border-t border-border-subtle pt-4">
        <p className="text-sm font-bold text-primary">Price bump <span className="font-normal text-muted">— for any reason; folded into the roofline price, the client just sees the price</span></p>
        <div className="flex items-center gap-2 flex-wrap">
          {BUMPS.map((n) => (
            <button key={n} onClick={() => update({ adjust: n })}
              className={`rounded-xl px-4 py-2 text-sm font-bold cursor-pointer border-2 ${v.adjust === n ? 'border-brand bg-brand/10 text-primary' : 'border-border-default text-secondary hover:text-primary'}`}>
              {n === 0 ? '$0' : `+${money(n)}`}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-sm text-secondary whitespace-nowrap ml-1">
            Other $
            <input type="number" min="0" value={BUMPS.includes(v.adjust) ? '' : v.adjust} placeholder="—" onChange={(e) => update({ adjust: Math.max(0, Number(e.target.value) || 0) })} className={`${box} w-20`} />
          </label>
        </div>
        {basePrice > 0 && <p className="text-xs text-muted">Roofline price on the Present page: <b className="text-primary">{money(basePrice + (Number(v.adjust) || 0))}</b>{v.adjust > 0 && <> ({money(basePrice)} + {money(v.adjust)})</>}</p>}
      </div>
    </div>
  );
}
