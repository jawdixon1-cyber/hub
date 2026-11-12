import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlanOverlay, OutletMarks } from '../components/LightsMarkup';
import { kindOf } from '../lib/lightsMaterials';
import { DESIGNS } from '../lib/lightsDesigns';
import { typeOf, extraMath } from '../lib/lightsExtras';

// Crew view — opened from a secret link, no login. The plan (with feet) + materials to load. No prices.

const GREEN = '#00DF00';
const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—');

function PlanPhoto({ side, big = false }) {
  const w = side.w || 1600;
  const h = side.h || 1200;
  return (
    <div className={big ? 'relative inline-block' : 'relative'}>
      <img src={side.plain} alt="" className={big ? 'block max-h-[82vh] max-w-full w-auto' : 'block w-full'} />
      {side.w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          <PlanOverlay lines={side.lines} jumps={side.jumps} w={w} h={h} tags />
          <OutletMarks outlets={side.outlets} w={w} h={h} />
          <OutletMarks inline outlets={side.inlines} w={w} h={h} />
        </svg>
      )}
    </div>
  );
}

const GROUPS = [
  ['Lights', (it) => ['bulb', 'wire', 'clip'].includes(kindOf(it))],
  ['Zip cord', (it) => /zip/i.test(it.name)],
  ['Extras (mini strands)', (it) => kindOf(it) === 'mini'],
  ['Power', (it) => /plug|timer/i.test(it.name)],
  ['Other', () => true],
];

export default function LightsCrew() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [at, setAt] = useState(0);
  const [full, setFull] = useState(false);
  const [bigImg, setBigImg] = useState('');
  const checkKey = `crew-checked:${token}`;
  const [checked, setChecked] = useState(() => { try { return JSON.parse(localStorage.getItem(checkKey) || '{}'); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem(checkKey, JSON.stringify(checked)); } catch { /* ignore */ } }, [checkKey, checked]);

  useEffect(() => {
    fetch(`/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This crew link isn’t valid anymore.' : 'Couldn’t load the job.'))))
      .then(setJob)
      .catch((e) => setError(e.message));
  }, [token]);

  const sides = job?.sides || [];
  const go = (d) => setAt((a) => Math.min(sides.length - 1, Math.max(0, a + d)));
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'Escape') { setFull(false); setBigImg(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <div className="min-h-screen bg-[#0b0b0d] text-white flex items-center justify-center p-6 text-center text-lg">{error}</div>;
  if (!job) return <div className="min-h-screen bg-[#0b0b0d] flex items-center justify-center"><div className="w-8 h-8 border-4 border-white/20 border-t-[#00DF00] rounded-full animate-spin" /></div>;

  const side = sides[at];
  const design = DESIGNS.find((d) => d.id === job.style);
  const used = new Set();
  const groups = GROUPS.map(([label, test]) => {
    const items = job.materials.filter((m) => !used.has(m.id) && test(m));
    items.forEach((m) => used.add(m.id));
    return [label, items];
  }).filter(([, items]) => items.length);
  const done = job.materials.filter((m) => checked[m.id]).length;
  const nav = sides.length > 1 && (
    <div className="flex items-center justify-center gap-3">
      <button onClick={() => go(-1)} disabled={at === 0} className="w-12 h-12 rounded-xl bg-white/10 text-2xl font-bold disabled:opacity-25 active:bg-white/20 cursor-pointer">‹</button>
      <span className="text-base font-bold min-w-[130px] text-center">Section {at + 1} of {sides.length}</span>
      <button onClick={() => go(1)} disabled={at === sides.length - 1} className="w-12 h-12 rounded-xl bg-white/10 text-2xl font-bold disabled:opacity-25 active:bg-white/20 cursor-pointer">›</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-white">
      <div className="mx-auto max-w-3xl px-4 py-5 space-y-6">
        {/* Job */}
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <img src="/holiday-logo.png" alt="Hey Jude's" className="h-9 w-auto" />
            <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-black" style={{ background: GREEN }}>Crew view</span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight">{job.client}</h1>
          {job.address && (
            <a href={`https://maps.apple.com/?q=${encodeURIComponent(job.address)}`} className="block text-base text-white/80 underline underline-offset-4">📍 {job.address}</a>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-white/10 px-3 py-1.5">🎄 Install <b>{day(job.installDate)}</b></span>
            <span className="rounded-lg bg-white/10 px-3 py-1.5">📦 Takedown <b>{day(job.takedownDate)}</b></span>
            {design && <span className="rounded-lg bg-white/10 px-3 py-1.5">💡 <b>{design.label}</b></span>}
            {job.gutterGuard && <span className="rounded-lg bg-white/10 px-3 py-1.5">Gutter guards: <b>{job.gutterGuard === 'yes' ? 'Yes' : 'No'}</b></span>}
          </div>
          {(job.power || job.powerPhoto) && (
            <div className="flex items-center gap-3 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3">
              {job.powerPhoto && <img src={job.powerPhoto} alt="Outlet" onClick={() => setBigImg(job.powerPhoto)} className="h-16 w-16 rounded-lg object-cover cursor-zoom-in" />}
              <p className="text-base"><span className="font-bold text-yellow-300">🔌 Power:</span> {job.power || 'see photo'}</p>
            </div>
          )}
        </header>

        {/* Plan */}
        {side && (
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold">The plan</h2>
            {nav}
            <button onClick={() => setFull(true)} className="block w-full overflow-hidden rounded-2xl border border-white/10 cursor-zoom-in">
              <PlanPhoto side={side} />
            </button>
            <p className="text-xs text-white/50 text-center">Tap the photo for full screen</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/70">
              <span>━ Lights (wire color)</span><span>••• Zip line</span><span>🔌 Power</span><span>⚡ Inline</span>
            </div>
          </section>
        )}

        {/* Extras */}
        {job.extras.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xl font-extrabold">Extras</h2>
            {job.extras.map((x, k) => {
              const t = typeOf(x.type);
              const m = extraMath(x);
              return (
                <div key={x.id || k} className="flex items-center gap-3 rounded-xl bg-white/[0.05] border border-white/10 p-3">
                  <span className="w-8 h-8 shrink-0 rounded-full text-black font-extrabold flex items-center justify-center" style={{ background: GREEN }}>{k + 1}</span>
                  <div className="flex-1">
                    <p className="font-bold">{x.label?.trim() || t.label} <span className="text-white/50 font-normal">· section {x.side + 1}</span></p>
                    <p className="text-sm text-white/60">{m.math || t.label}{x.wraps ? ` · ${x.wraps} wraps` : ''}</p>
                  </div>
                  <span className="font-bold">{m.strands} strand{m.strands === 1 ? '' : 's'}</span>
                </div>
              );
            })}
          </section>
        )}

        {/* Materials */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold">Materials</h2>
            <span className="text-sm text-white/60">{done} of {job.materials.length} loaded</span>
          </div>
          {groups.map(([label, items]) => (
            <div key={label} className="rounded-2xl border border-white/10 overflow-hidden">
              <p className="px-4 py-2.5 bg-white/[0.06] font-bold">{label}</p>
              <div className="divide-y divide-white/10">
                {items.map((m) => (
                  <label key={m.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${checked[m.id] ? 'opacity-50' : ''}`}>
                    <input type="checkbox" checked={!!checked[m.id]} onChange={(e) => setChecked((c) => ({ ...c, [m.id]: e.target.checked }))} className="w-6 h-6 accent-[#00DF00]" />
                    {m.image ? <img src={m.image} alt="" className="w-11 h-11 rounded-lg object-cover bg-white shrink-0" /> : <span className="w-11 h-11 rounded-lg bg-white/10 shrink-0" />}
                    <span className={`flex-1 font-semibold leading-tight ${checked[m.id] ? 'line-through' : ''}`}>{m.name}{m.note && <span className="block text-xs font-normal text-white/60">{m.note}</span>}</span>
                    <span className="text-lg font-extrabold tabular-nums">{m.qty}<span className="text-sm font-normal text-white/60"> {m.unit}</span></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!job.materials.length && <p className="text-white/60">No materials on this job yet.</p>}
        </section>
      </div>

      {/* Full-screen plan */}
      {full && side && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-3">
            {nav || <span />}
            <button onClick={() => setFull(false)} className="w-12 h-12 rounded-xl bg-white/10 text-xl cursor-pointer">✕</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-2"><PlanPhoto side={side} big /></div>
        </div>
      )}
      {bigImg && <div onClick={() => setBigImg('')} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"><img src={bigImg} alt="" className="max-w-full max-h-full rounded-lg" /></div>}
    </div>
  );
}
