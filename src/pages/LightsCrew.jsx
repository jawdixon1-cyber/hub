import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlanOverlay, OutletMarks } from '../components/LightsMarkup';
import { kindOf } from '../lib/lightsMaterials';
import { DESIGNS } from '../lib/lightsDesigns';
import { typeOf, extraMath } from '../lib/lightsExtras';

// Crew view — opened from a secret link, no login. The plan (with feet) + materials to load. No prices.

const GREEN = '#00DF00';

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
  // Measurer's actual feet per line ("side-line", zips "zside-jump"), typed on the roof and saved to the Hub.
  const [edits, setEdits] = useState({});
  const [saveState, setSaveState] = useState(''); // '', 'saving', 'saved', 'error'
  const actualOf = (k) => (k in edits ? edits[k] : job?.actual?.[k] || '');
  const saveActual = (next) => {
    setSaveState('saving');
    fetch(`/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual: { ...(job?.actual || {}), ...next } }),
    }).then((r) => setSaveState(r.ok ? 'saved' : 'error')).catch(() => setSaveState('error'));
  };

  useEffect(() => {
    fetch(`/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This team link isn’t valid anymore.' : 'Couldn’t load the job.'))))
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
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-10 space-y-6">
        {/* Job */}
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <img src="/holiday-logo.png" alt="Hey Jude's" className="h-9 w-auto" />
            <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-black" style={{ background: GREEN }}>Team view</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight break-words capitalize">{job.client}</h1>
          {job.address && (
            <a href={`https://maps.apple.com/?q=${encodeURIComponent(job.address)}`} className="block text-base text-white/80 underline underline-offset-4">📍 {job.address}</a>
          )}
          {(job.power || job.powerPhoto) && (
            <div className="flex items-center gap-3 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3">
              {job.powerPhoto && <img src={job.powerPhoto} alt="Outlet" onClick={() => setBigImg(job.powerPhoto)} className="h-16 w-16 rounded-lg object-cover cursor-zoom-in" />}
              <p className="text-base"><span className="font-bold text-yellow-300">🔌 Power:</span> {job.power || 'see photo'}</p>
            </div>
          )}
          {design && (
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-base">💡 <span className="font-bold">Bulbs:</span> {job.style === 'custom' ? `Custom: ${job.customColor || 'ask Jude'}` : design.label}</div>
          )}
        </header>

        {/* SOP — how a 2-person crew starts every job */}
        <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: GREEN, background: 'rgba(0,223,0,0.06)' }}>
          <h2 className="text-xl font-extrabold">When you get there (2 people)</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.06] p-3 space-y-1">
              <p className="font-extrabold">👷 Person 1: Unload</p>
              <ol className="list-decimal pl-5 text-sm text-white/85 space-y-0.5">
                <li>Unload everything on the <b className="text-white">Materials</b> list below.</li>
                <li>Check each item off as it comes off the truck.</li>
                <li>Missing or short on anything? Call Jude <b className="text-white">before</b> you start hanging.</li>
              </ol>
            </div>
            <div className="rounded-xl bg-white/[0.06] p-3 space-y-1">
              <p className="font-extrabold">📏 Person 2: Measure</p>
              <ol className="list-decimal pl-5 text-sm text-white/85 space-y-0.5">
                <li>Measure every line on <b className="text-white">The plan</b> — the real roofline.</li>
                <li>Type each one in the <b className="text-white">Actual ft</b> box under its section.</li>
                <li>Way off from the plan (5+ ft)? Tell Jude before cutting wire.</li>
              </ol>
            </div>
          </div>
          <p className="text-sm text-white/70">Then hang it together, following the plan's colors and lengths.</p>
        </section>

        {/* Plan */}
        {sides.length > 0 && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold">The plan</h2>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2 text-sm">
                <p className="font-bold">Cheat sheet</p>
                <p className="text-white/80"><b className="text-white">Colors are real.</b> Whatever color a line is on the plan, that's the color you use. White line = white wire. Black line = black wire. Green line = green wire. Same for zip lines.</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-white/80">
                  <li><b className="text-white">━ Solid line</b> = lights (in that wire color)</li>
                  <li><b className="text-white">••• Dotted line</b> = zip line (in that cord color)</li>
                  <li><b className="text-white">🔌</b> = where it plugs in</li>
                  <li><b className="text-white">⚡</b> = inline connection</li>
                  <li><b className="text-white">30 ft</b> tag = length of that run</li>
                </ul>
              </div>
            </div>
            {/* Every section top to bottom, in order — just scroll. Tap one for full screen. */}
            {sides.map((sd, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-base font-bold">Section {i + 1}{sides.length > 1 ? <span className="text-white/50 font-normal"> of {sides.length}</span> : null}</p>
                <button onClick={() => { setAt(i); setFull(true); }} className="block -mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full overflow-hidden sm:rounded-2xl border-y sm:border border-white/10 cursor-zoom-in">
                  <PlanPhoto side={sd} />
                </button>
                {/* Measurer: actual feet for each line in this section */}
                {((sd.lines || []).length > 0 || (sd.jumps || []).length > 0) && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                    <p className="text-sm font-bold">📏 Actual ft <span className="font-normal text-white/50">— what you measured</span></p>
                    {[...(sd.lines || []).map((l, li) => [`${i}-${li}`, `Line ${li + 1}`, l.feet]), ...(sd.jumps || []).map((l, ji) => [`z${i}-${ji}`, `Zip ${ji + 1}`, l.feet])].map(([k, label, plan]) => {
                      const v = actualOf(k);
                      const off = v !== '' && Number(plan) > 0 && Math.abs(Number(v) - Number(plan)) >= 5;
                      return (
                        <label key={k} className="flex items-center gap-3">
                          <span className="w-16 text-sm font-semibold">{label}</span>
                          <span className="w-24 text-sm text-white/60">plan {plan ? `${plan} ft` : '—'}</span>
                          <input value={v} inputMode="decimal" placeholder="ft"
                            onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value.replace(/[^0-9.]/g, '') }))}
                            onBlur={() => { if (k in edits) saveActual(edits); }}
                            className={`w-24 rounded-lg border bg-black px-3 py-2 text-lg font-bold text-center outline-none ${off ? 'border-yellow-400 text-yellow-300' : 'border-white/20 text-white focus:border-[#00DF00]'}`} />
                          {off && <span className="text-xs font-semibold text-yellow-300">off by {Math.abs(Number(v) - Number(plan)).toFixed(1).replace(/\.0$/, '')} ft</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {saveState && <p className={`text-sm font-semibold ${saveState === 'error' ? 'text-red-400' : 'text-white/70'}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Measurements saved — Jude can see them' : 'Couldn’t save — check signal and tap a box again'}</p>}
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
                  <span className="shrink-0 font-bold">{m.strands} strand{m.strands === 1 ? '' : 's'}</span>
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
                    <span className="shrink-0 text-lg font-extrabold tabular-nums">{m.qty}<span className="text-sm font-normal text-white/60"> {m.unit}</span></span>
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
