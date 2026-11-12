import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { EXTRA_TYPES, STRAND_FT, extraMath, extrasStrands, typeOf } from '../lib/lightsExtras';

const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`;

// Extras step: pick a photo, tap each thing to light (column, railing, tree, bush…),
// type its measurements → strands → price. Markers are numbered on the photo.
export default function LightsExtras({ angles, extras, setExtras, perStrand, setPerStrand }) {
  const sides = angles.map((a, i) => ({ a, i })).filter(({ a }) => a.plain);
  const [side, setSide] = useState(() => sides[0]?.i ?? 0);
  const [adding, setAdding] = useState('column');
  const cur = angles[side];
  const list = extras || [];
  const patch = (id, p) => setExtras((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id) => setExtras((xs) => xs.filter((x) => x.id !== id));
  const add = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setExtras((xs) => [...(xs || []), { id: `${Date.now()}`, side, x, y, type: adding, run: '', around: '', wraps: '', width: '', strands: '' }]);
  };
  const total = extrasStrands(list);
  const field = 'w-20 rounded-lg border border-border-strong bg-card px-2 py-1.5 text-sm text-primary text-center outline-none focus:border-brand';

  return (
    <div className="rounded-xl border border-border-default bg-card p-4 space-y-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <p className="text-lg font-bold text-primary">Extras</p>
          <p className="text-xs text-muted mt-0.5">Columns, railings, trees, bushes — anything besides the roofline. Pick the type, tap it on the photo, put in the measurements.</p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border-default px-3 py-2">
          <span className="text-sm text-secondary">$</span>
          <input value={perStrand} onChange={(e) => setPerStrand(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="w-16 bg-transparent text-base font-bold text-primary outline-none" />
          <span className="text-sm text-secondary">per strand ({STRAND_FT} ft)</span>
        </label>
      </div>

      {!sides.length ? <p className="text-sm text-muted">Add photos in step 2 first.</p> : (
        <>
          {sides.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {sides.map(({ a, i }) => (
                <button key={i} onClick={() => setSide(i)} className={`relative rounded-lg overflow-hidden border-2 cursor-pointer ${side === i ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                  <img src={a.plain} alt="" className="h-16 w-24 object-cover" />
                  <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white drop-shadow">Section {i + 1}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted">Tap to add:</span>
            {EXTRA_TYPES.map((t) => (
              <button key={t.id} onClick={() => setAdding(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer ${adding === t.id ? 'bg-primary text-surface border-primary' : 'border-border-default text-secondary hover:text-primary'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {cur?.plain && (
            <div className="relative cursor-crosshair select-none" onClick={add}>
              <img src={cur.plain} alt="" className="block w-full rounded-lg" draggable={false} />
              {list.map((it, k) => (it.side === side ? (
                <span key={it.id} onClick={(e) => e.stopPropagation()} className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-brand text-on-brand text-sm font-extrabold flex items-center justify-center ring-2 ring-black shadow-lg"
                  style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%` }} title={typeOf(it.type).label}>{k + 1}</span>
              ) : null))}
            </div>
          )}
        </>
      )}

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((it, k) => {
            const t = typeOf(it.type);
            const m = extraMath(it);
            return (
              <div key={it.id} className="rounded-lg border border-border-default p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-7 h-7 rounded-full bg-brand text-on-brand text-sm font-extrabold flex items-center justify-center">{k + 1}</span>
                  <select value={it.type} onChange={(e) => patch(it.id, { type: e.target.value })} className="rounded-lg border border-border-strong bg-card px-2 py-1.5 text-sm font-semibold text-primary">
                    {EXTRA_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <input value={it.label || ''} onChange={(e) => patch(it.id, { label: e.target.value })} placeholder="Note — e.g. left porch column" className="flex-1 min-w-[140px] rounded-lg border border-border-strong bg-card px-2 py-1.5 text-sm text-primary outline-none focus:border-brand" />
                  {sides.length > 1 && <span className="text-xs text-muted">Section {it.side + 1}</span>}
                  <button onClick={() => remove(it.id)} className="p-1.5 text-muted hover:text-red-500 cursor-pointer" title="Remove"><Trash2 size={15} /></button>
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                  {t.fields.map(([key, label]) => (
                    <label key={key} className="space-y-0.5">
                      <span className="block text-[11px] text-muted">{label}</span>
                      <input value={it[key] || ''} onChange={(e) => patch(it.id, { [key]: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" className={field} />
                    </label>
                  ))}
                  <label className="space-y-0.5">
                    <span className="block text-[11px] text-muted">Strands{t.kind !== 'manual' ? ' (auto)' : ''}</span>
                    <input value={it.strands ?? ''} onChange={(e) => patch(it.id, { strands: e.target.value.replace(/[^0-9]/g, '') })} placeholder={t.kind !== 'manual' ? String(m.auto) : '0'} inputMode="numeric" className={field} />
                  </label>
                  <div className="ml-auto text-right">
                    <p className="text-base font-bold text-primary tabular-nums">{m.strands} strand{m.strands === 1 ? '' : 's'} · {money(m.strands * (Number(perStrand) || 0))}</p>
                    {m.math && <p className="text-[11px] text-muted">{m.math}{t.kind === 'wrap' && m.ft > 0 ? ` ÷ ${STRAND_FT}` : ''}{m.typed ? ' · typed over' : ''}</p>}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between rounded-lg bg-brand-light border border-border-brand px-4 py-3">
            <span className="text-sm text-secondary">{list.length} item{list.length === 1 ? '' : 's'} · {total} strand{total === 1 ? '' : 's'} × ${Number(perStrand) || 0}</span>
            <span className="text-2xl font-bold text-brand-text">{money(total * (Number(perStrand) || 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
