import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlanOverlay, OutletMarks } from '../components/LightsMarkup';
import { kindOf } from '../lib/lightsMaterials';
import { DESIGNS } from '../lib/lightsDesigns';
import { typeOf, extraMath } from '../lib/lightsExtras';
import { groupTotal, groupPlan, fmt, wireOf, wireName, strandTotal, crewStrands, shrinkPhoto } from '../lib/strands';
import StrandSheet, { StrandNo } from '../components/StrandSheet';
import { CrewDraw, CrewPhoto } from '../components/CrewStrandMap';

// Crew view — opened from a secret link, no login. The plan (with feet) + materials to load. No prices.

const GREEN = '#00DF00';

function PlanPhoto({ side, big = false, marks = null }) {
  const w = side.w || 1600;
  const h = side.h || 1200;
  return (
    <div className={big ? 'relative inline-block' : 'relative'}>
      <img src={side.plain} alt="" decoding="async" loading={big ? undefined : "lazy"} className={big ? 'block max-h-[82vh] max-w-full w-auto' : 'block w-full bg-white/5'} style={big ? undefined : { aspectRatio: `${w} / ${h}` }} />
      {side.w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          <PlanOverlay lines={side.lines} jumps={side.jumps} w={w} h={h} />
          <OutletMarks outlets={side.outlets} w={w} h={h} />
          <OutletMarks inline outlets={side.inlines} w={w} h={h} />
          {marks}
        </svg>
      )}
    </div>
  );
}

// A section that opens/closes with one big tap.
function Fold({ id, title, sub, open, onToggle, children }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(open); // render the inside on first open, then keep it (reopening is instant)
  if (open && !seen) setSeen(true);
  const close = () => { onToggle(id); requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start' })); };
  return (
    <section ref={ref} className="rounded-2xl border border-white/10 overflow-hidden scroll-mt-3">
      <button onClick={() => onToggle(id)} className="w-full flex items-center gap-3 px-4 py-4 bg-white/[0.05] text-left cursor-pointer active:bg-white/10">
        <span className="flex-1"><span className="block text-xl font-extrabold">{title}</span>{sub && <span className="block text-sm text-white/60">{sub}</span>}</span>
        <span className={`text-2xl text-white/70 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {seen && <div className={`p-3 sm:p-4 space-y-4 ${open ? '' : 'hidden'}`}>{children}
        <button onClick={close} className="w-full h-14 rounded-xl bg-white/10 text-lg font-extrabold cursor-pointer active:bg-white/20">▲ Close {title.replace(/^\S+\s/, '').toLowerCase()}</button>
      </div>}
    </section>
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
  // Measurer's numbers, typed on the roof and saved to the Hub (shared by both crew phones):
  // actual = feet per strand ("side-line") / zip ("zside-jump"); parts = each strand's pieces; done = strand finished.
  const [fold, setFold] = useState(() => { try { return JSON.parse(localStorage.getItem('crew-fold') || '{}'); } catch { return {}; } });
  const toggleFold = (k) => setFold((f) => { const n = { ...f, [k]: !f[k] }; try { localStorage.setItem('crew-fold', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [edits, setEdits] = useState({});
  const [parts, setParts] = useState({});
  const [doneMap, setDoneMap] = useState({});
  const [open, setOpen] = useState(''); // id of the strand sheet showing
  const [joins, setJoins] = useState([]); // drawn lines the crew joined into one wire
  const [saveState, setSaveState] = useState(''); // '', 'saving', 'saved', 'error'
  const actualOf = (k) => (k in edits ? edits[k] : job?.actual?.[k] || '');
  const pending = useRef({ actual: {}, parts: {}, done: {} });
  const pendingGroups = useRef(null);
  const timer = useRef(null);
  const flush = () => {
    const body = { ...pending.current, ...(pendingGroups.current ? { groups: pendingGroups.current } : {}) };
    pending.current = { actual: {}, parts: {}, done: {} };
    pendingGroups.current = null;
    setSaveState('saving');
    fetch(`/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then((r) => setSaveState(r.ok ? 'saved' : 'error')).catch(() => setSaveState('error'));
  };
  const queue = (patch) => {
    const p = pending.current;
    pending.current = { actual: { ...p.actual, ...patch.actual }, parts: { ...p.parts, ...patch.parts }, done: { ...p.done, ...patch.done } };
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };
  useEffect(() => () => { clearTimeout(timer.current); if (pendingGroups.current || Object.keys(pending.current.actual).length + Object.keys(pending.current.parts).length + Object.keys(pending.current.done).length) flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setActual = (k, v) => { setEdits((x) => ({ ...x, [k]: v })); queue({ actual: { [k]: v } }); };
  const setStrandParts = (k, arr) => {
    setParts((x) => ({ ...x, [k]: arr }));
    const t = strandTotal(arr);
    const v = t == null ? '' : fmt(t);
    setEdits((x) => ({ ...x, [k]: v }));
    queue({ parts: { [k]: arr }, actual: { [k]: v } });
  };
  const saveLabel = (st) => (st === 'saving' ? 'Saving…' : st === 'saved' ? '✓ Saved — Jude can see it' : 'Couldn’t save — check signal');
  // Site photos the crew took + the strands they drew on them (M/F ends, ➜ = keeps going in the next photo).
  // Once any strand is drawn there, those are the strands to measure (instead of the plan's lines).
  const [crewMap, setCrewMap] = useState({ photos: [], seq: 0 });
  const [localPics, setLocalPics] = useState({}); // pid → data URL, just uploaded on this phone
  const [drawPid, setDrawPid] = useState('');
  const [zipOpen, setZipOpen] = useState(''); // zip cord key whose photo + feet sheet is open
  const [upState, setUpState] = useState(''); // '', 'up', error text
  const picUrl = (pid, thumb = false) => localPics[pid] || `/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}&cpic=${pid}${thumb ? '&t=1' : ''}`;
  const post = (body) => fetch(`/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const saveMap = (m) => {
    setCrewMap(m);
    setSaveState('saving');
    post({ map: m }).then((r) => setSaveState(r.ok ? 'saved' : 'error')).catch(() => setSaveState('error'));
  };
  const addPhoto = async (file) => {
    if (!file) return;
    setUpState('up');
    try {
      const { data, thumb, w, h } = await shrinkPhoto(file);
      const pid = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
      const r = await post({ pic: { pid, data, thumb } });
      if (!r.ok) throw new Error('Upload failed — check signal and try again.');
      setLocalPics((x) => ({ ...x, [pid]: data }));
      const no = Math.min(99, crewMap.photos.reduce((a, p) => Math.max(a, p.no), 0) + 1);
      saveMap({ ...crewMap, photos: [...crewMap.photos, { pid, no, w, h, lines: [] }] });
      setDrawPid(pid);
      setUpState('');
    } catch (e) { setUpState(e.message || 'Upload failed'); }
  };
  const deletePhoto = (pid) => {
    saveMap({ ...crewMap, photos: crewMap.photos.filter((p) => p.pid !== pid) });
    post({ delPic: pid }).catch(() => {});
    setDrawPid('');
  };
  const crew = useMemo(() => crewStrands(crewMap, picUrl), [crewMap, localPics]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only the strands the crew drew on their site photos — never the plan's lines.
  const useCrew = true;
  const strands = crew.strands;
  const runs = crew.strands.flatMap((x) => x.runs);
  const strandSides = crew.sides;
  const strandDone = (x) => x.runs.every((r) => doneMap[r.key]);
  const saveGroups = (g) => { setJoins(g); pendingGroups.current = g; queue({}); };
  // Join strand `other` onto strand `x` (same wire). Split one roof line back out to its own strand.
  const joinStrands = (x, otherId) => {
    const o = strands.find((y) => y.id === otherId);
    if (!o) return;
    const keys = [...x.runs.map((r) => r.key), ...o.runs.map((r) => r.key)];
    saveGroups([...joins.map((g) => g.filter((k) => !keys.includes(k))).filter((g) => g.length > 1), keys]);
  };
  const splitRun = (key) => saveGroups(joins.map((g) => g.filter((k) => k !== key)).filter((g) => g.length > 1));
  const markDone = (x) => { const d = Object.fromEntries(x.runs.map((r) => [r.key, true])); setDoneMap((m) => ({ ...m, ...d })); queue({ done: d }); };

  useEffect(() => {
    fetch(`/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This team link isn’t valid anymore.' : 'Couldn’t load the job.'))))
      .then((j) => { setJob(j); setParts(j.parts || {}); setDoneMap(j.done || {}); setJoins(j.groups || []); setCrewMap(j.crewMap || { photos: [], seq: 0 }); })
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
          {/* Page title: client + street; tap for directions */}
          {(() => {
            const [street] = (job.address || '').split(', ');
            const inner = (
              <>
                <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight break-words"><span className="capitalize">{job.client}</span>{street && <span className="text-white/90"> · {street}</span>}</h1>
              </>
            );
            return job.address ? <a href={`https://maps.apple.com/?q=${encodeURIComponent(job.address)}`} className="block active:opacity-70">{inner}</a> : inner;
          })()}
          {(job.power || job.powerPhoto) && (
            <div className="flex items-center gap-3 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3">
              {job.powerPhoto && <img src={job.powerPhoto} alt="Outlet" onClick={() => setBigImg(job.powerPhoto)} className="h-16 w-16 rounded-lg object-cover cursor-zoom-in" />}
              <p className="text-base"><span className="font-bold text-yellow-300">🔌 Power:</span> {job.power || 'see photo'}</p>
            </div>
          )}
        </header>

        {/* The plan (Jude's) — tap to open */}
        <Fold id="plan" title="🗺 The plan" sub={`${sides.length} section${sides.length === 1 ? '' : 's'}${job.extras.length ? ` · ${job.extras.length} extra${job.extras.length === 1 ? '' : 's'}` : ''}`} open={fold.plan} onToggle={toggleFold}>
            {design && (
              <div className="rounded-xl bg-white/10 px-3 py-2.5 text-base">💡 <span className="font-bold">Bulbs:</span> {job.style === 'custom' ? `Custom: ${job.customColor || 'ask Jude'}` : design.label}</div>
            )}
            {/* Materials first — what to load */}
            <div className="flex items-baseline justify-between"><h3 className="text-lg font-extrabold">📦 Materials</h3><span className="text-sm text-white/60">{done} of {job.materials.length} loaded</span></div>
          {groups.map(([label, items]) => (
            <div key={label} className="rounded-2xl border border-white/10 overflow-hidden">
              <p className="px-4 py-2.5 bg-white/[0.06] font-bold">{label}</p>
              <div className="divide-y divide-white/10">
                {items.map((m) => (
                  <label key={m.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${checked[m.id] ? 'opacity-50' : ''}`}>
                    <input type="checkbox" checked={!!checked[m.id]} onChange={(e) => setChecked((c) => ({ ...c, [m.id]: e.target.checked }))} className="w-6 h-6 accent-[#00DF00]" />
                    {m.image ? <img src={m.image} alt="" loading="lazy" decoding="async" className="w-11 h-11 rounded-lg object-cover bg-white shrink-0" /> : <span className="w-11 h-11 rounded-lg bg-white/10 shrink-0" />}
                    <span className={`flex-1 font-semibold leading-tight ${checked[m.id] ? 'line-through' : ''}`}>{m.name}{m.note && <span className="block text-xs font-normal text-white/60">{m.note}</span>}</span>
                    <span className="shrink-0 text-lg font-extrabold tabular-nums">{m.qty}<span className="text-sm font-normal text-white/60"> {m.unit}</span></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!job.materials.length && <p className="text-white/60">No materials on this job yet.</p>}
            {/* Every section top to bottom, in order — just scroll. Tap one for full screen. */}
            {sides.map((sd, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-base font-bold">Section {i + 1}{sides.length > 1 ? <span className="text-white/50 font-normal"> of {sides.length}</span> : null}</p>
                <button onClick={() => { setAt(i); setFull(true); }} className="block -mx-3 w-[calc(100%+1.5rem)] sm:mx-0 sm:w-full overflow-hidden sm:rounded-xl border-y sm:border border-white/10 cursor-zoom-in">
                  <PlanPhoto side={sd} />
                </button>
              </div>
            ))}
            {job.extras.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-extrabold">Extras</h3>
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
              </div>
            )}
            {!sides.length && <p className="text-white/60">No plan photos on this job.</p>}
        </Fold>

        {/* Strands: crew photos + measuring */}
        <section className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-4 bg-white/[0.05]"><span className="block text-xl font-extrabold">🧵 Strands</span><span className="block text-sm text-white/60">Photos → draw → measure</span></div>
          <div className="divide-y divide-white/10">
            {/* Site photos: the crew draws the real strands here */}
            <div className="p-3 sm:p-4 space-y-3">
              <div>
                <p className="text-base font-bold">📸 Strand photos</p>
                <p className="text-sm text-white/60">Snap each side. Tap along each strand: <b className="text-white/80">M</b> where it plugs in, <b className="text-white/80">F</b> where it ends, <b className="text-white/80">➜</b> if it goes around the corner.</p>
              </div>
              {crewMap.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {crewMap.photos.map((p, i) => {
                    const ss = crew.strands;
                    const rankOf = (sv) => ss.find((x) => x.s === sv)?.no || 0;
                    return (
                      <button key={p.pid} onClick={() => setDrawPid(p.pid)} className="relative rounded-xl overflow-hidden border border-white/10 cursor-pointer text-left">
                        <CrewPhoto src={picUrl(p.pid, true)} w={p.w} h={p.h} lines={p.lines} rankOf={rankOf} />
                        <span className="absolute top-1.5 left-1.5 rounded-md bg-black/75 px-2 py-0.5 text-sm font-bold">Photo {i + 1}{p.lines.length ? '' : ' · draw ›'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <label className={`flex items-center justify-center w-full h-14 rounded-xl border-2 border-dashed border-white/30 text-lg font-extrabold cursor-pointer active:bg-white/10 ${upState === 'up' ? 'opacity-50 pointer-events-none' : ''}`}>
                {upState === 'up' ? 'Uploading…' : '＋ Add photo'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {upState && upState !== 'up' && <p className="text-sm font-semibold text-red-400">{upState}</p>}
            </div>
            {strands.length > 0 && (() => {
              const nDone = strands.filter(strandDone).length;
              const next = strands.findIndex((x) => !strandDone(x));
              const ft = runs.reduce((a, r) => a + (Number(actualOf(r.key)) || 0), 0);
              // Zip cords need their feet too (they come out of stock).
              const zips = useCrew ? crew.zips : [];
              const zDone = zips.filter((z) => Number(actualOf(z.key)) > 0).length;
              const total = strands.length + zips.length;
              return (
                <div className="p-3 sm:p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-base font-bold">📏 {nDone} of {strands.length} strands done{zips.length ? ` · ${zDone} of ${zips.length} zip cords` : ''}</p>
                    {ft > 0 && <p className="text-base font-bold tabular-nums">{fmt(ft)} ft</p>}
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${((nDone + zDone) / total) * 100}%`, background: GREEN }} /></div>
                  <button onClick={() => setOpen(strands[next >= 0 ? next : 0].id)} className="w-full h-14 rounded-xl text-black text-lg font-extrabold cursor-pointer" style={{ background: GREEN }}>
                    {next < 0 ? (zDone < zips.length ? `Strands done ✓ — measure ${zips.length - zDone} zip cord${zips.length - zDone === 1 ? '' : 's'} below` : 'All done ✓ — review') : nDone ? `Next: Strand ${strands[next].no} ›` : 'Start measuring · Strand 1 ›'}
                  </button>
                  {!useCrew && <p className="text-sm text-white/60">One wire across a few roof lines? Open a strand and tap <b className="text-white/80">＋ Join</b>.</p>}
                </div>
              );
            })()}
            {/* Strands (wires), in install order. Tap one to measure it. */}
            {strands.length > 0 && <div className="p-3 sm:p-4 space-y-2">
              
              {strands.map((x) => {
                const t = groupTotal(x, (k) => parts[k]);
                const plan = groupPlan(x);
                const secs = [...new Set(x.runs.map((r) => r.si + 1))];
                const where = useCrew ? `photo ${secs.join('+')}${x.open ? ' · ➜ not finished' : ''}` : `section ${secs.join('+')}${x.runs.length > 1 ? ` · ${x.runs.length} roof lines` : ''}${x.power ? ' · ⚡ start here' : ''}`;
                const dn = strandDone(x);
                return (
                  <button key={x.id} onClick={() => setOpen(x.id)} className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left cursor-pointer active:bg-white/10 ${dn ? 'border-[#00DF00]/40 bg-[#00DF00]/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
                    <StrandNo no={x.no} wire={wireOf(x, job.wire)} done={dn} />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold leading-tight">Strand {x.no} · {wireName(wireOf(x, job.wire))} wire</p>
                      <p className="text-sm text-white/60">{plan ? `plan ${fmt(plan)} ft · ` : useCrew ? '' : 'no plan ft · '}{where}</p>
                    </div>
                    {t != null ? <span className="shrink-0 text-lg font-extrabold tabular-nums">{fmt(t)} ft</span> : <span className="shrink-0 text-base font-bold" style={{ color: GREEN }}>Measure ›</span>}
                  </button>
                );
              })}
            </div>}
            {useCrew && crew.zips.length > 0 && (
              <div className="p-3 sm:p-4 space-y-2">
                <h3 className="text-lg font-extrabold">Zip cords <span className="text-sm font-normal text-white/60">no lights · measure each one</span></h3>
                {crew.zips.map((z, i) => {
                  const zf = Number(actualOf(z.key)) > 0;
                  return (
                    <button key={z.key} onClick={() => setZipOpen(z.key)} className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left cursor-pointer active:bg-white/10 ${zf ? 'border-[#00DF00]/40 bg-[#00DF00]/[0.06]' : 'border-yellow-400/50 bg-yellow-400/[0.06]'}`}>
                      <span className="w-9 h-9 shrink-0 rounded-full text-black font-extrabold flex items-center justify-center" style={{ background: '#FB923C' }}>Z</span>
                      <span className="flex-1 text-base font-bold">Zip cord {i + 1} <span className="text-white/60 font-normal">· photo {z.si + 1}</span></span>
                      {zf ? <span className="shrink-0 text-lg font-extrabold tabular-nums">{actualOf(z.key)} ft</span> : <span className="shrink-0 text-base font-bold" style={{ color: '#FB923C' }}>Measure ›</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {saveState && <p className={`px-4 py-2.5 text-sm font-semibold ${saveState === 'error' ? 'text-red-400' : 'text-white/70'}`}>{saveLabel(saveState)}</p>}
          </div>
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
      {open && (() => {
        const idx = strands.findIndex((y) => y.id === open || y.runs.some((r) => r.key === open));
        if (idx < 0) return null;
        const x = strands[idx];
        return (
          <StrandSheet key={x.id} strand={x} strands={strands} idx={idx} sides={strandSides} jobWire={job.wire}
            partsOf={(k) => parts[k]} onParts={setStrandParts}
            zipFt={(si, zi) => actualOf(`z${si}-${zi}`)} onZip={(si, zi, v) => setActual(`z${si}-${zi}`, v)}
            onDone={() => markDone(x)}
            onJoin={(otherId) => joinStrands(x, otherId)} onSplit={splitRun}
            onPrev={() => setOpen(strands[Math.max(0, idx - 1)].id)} onNext={() => setOpen(strands[Math.min(strands.length - 1, idx + 1)].id)}
            onClose={() => setOpen('')} saveState={saveState} labelOf={saveLabel} />
        );
      })()}
      {/* Zip cord: its photo (this zip lit up) + one big feet box */}
      {zipOpen && (() => {
        const zi = crew.zips.findIndex((z) => z.key === zipOpen);
        const z = crew.zips[zi];
        const ph = z && crewMap.photos[z.si];
        if (!ph) return null;
        const lid = Number(z.key.split('-').pop());
        const ss = crew.strands;
        const nextZ = crew.zips[zi + 1]; // just the next one, in order
        return (
          <div className="fixed inset-0 z-[60] bg-[#0b0b0d] text-white flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <span className="w-10 h-10 shrink-0 rounded-full text-black font-extrabold flex items-center justify-center" style={{ background: '#FB923C' }}>Z</span>
              <p className="flex-1 text-xl font-extrabold">Zip cord {zi + 1} <span className="text-base font-normal text-white/60">· photo {z.si + 1}</span></p>
              <button onClick={() => setZipOpen('')} className="w-12 h-12 rounded-xl bg-white/10 text-xl cursor-pointer">✕</button>
            </div>
            {/* Whole photo fits on screen (phone or computer) — no scrolling */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-2">
              <div className="rounded-lg overflow-hidden" style={{ width: `min(100%, calc((100dvh - 290px) * ${(ph.w || 4) / (ph.h || 3)}))` }}>
                <CrewPhoto src={picUrl(ph.pid)} w={ph.w} h={ph.h} lines={ph.lines} rankOf={(sv) => ss.find((x) => x.s === sv)?.no || 0} sel={lid} ftOf={(l) => Math.round((Number(actualOf(`${l.k === 'zip' ? 'zc' : 'c'}${ph.no}-${l.id}`)) || 0) * 10) / 10} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-xl border-t border-white/10 px-4 pt-3 pb-5 space-y-3">
              <p className="text-sm text-white/60">No lights — just tape the cord from end to end.</p>
              <label className="flex items-center gap-3">
                <span className="text-base font-bold">Feet</span>
                <input autoFocus value={actualOf(z.key)} inputMode="decimal" placeholder="ft" onChange={(e) => setActual(z.key, e.target.value.replace(/[^0-9.]/g, ''))}
                  className="flex-1 h-14 rounded-xl border-2 border-white/20 bg-black px-3 text-2xl font-extrabold text-center outline-none focus:border-[#FB923C]" />
              </label>
              <button onClick={() => setZipOpen(nextZ ? nextZ.key : '')} className="w-full h-14 rounded-xl text-black text-lg font-extrabold cursor-pointer" style={{ background: GREEN }}>
                {nextZ ? `Done · next zip cord ›` : 'Done ✓'}
              </button>
              {saveState && <p className={`text-sm font-semibold ${saveState === 'error' ? 'text-red-400' : 'text-white/70'}`}>{saveLabel(saveState)}</p>}
            </div>
          </div>
        );
      })()}
      {drawPid && (() => {
        const i = crewMap.photos.findIndex((p) => p.pid === drawPid);
        if (i < 0) return null;
        const p = crewMap.photos[i];
        return <CrewDraw photo={p} src={picUrl(p.pid)} label={`Photo ${i + 1}`} map={crewMap} onSave={saveMap} onClose={() => setDrawPid('')} onDelete={() => deletePhoto(p.pid)} />;
      })()}
      {bigImg && <div onClick={() => setBigImg('')} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"><img src={bigImg} alt="" className="max-w-full max-h-full rounded-lg" /></div>}
    </div>
  );
}
