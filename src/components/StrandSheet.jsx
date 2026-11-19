import { useEffect, useRef, useState } from 'react';
import { EndMarks } from './CrewStrandMap';
import { pieceFeet, pitchOf, fmt, wireOf, wireHex, wireName, blankParts, strandTotal, groupTotal, groupPlan } from '../lib/strands';

// Crew strand tool: one strand (one wire) at a time, full screen. A strand can be several drawn
// roof lines joined, even across photos. Shows each one lit on its photo, the wire color, what it
// hooks to, and its pieces (flat = tape it; slope = flat bottom + phone angle).

const MOUNT = { gutter: 'Gutter · flex clips', guard: 'Gutter guard · shingle tabs', shingle: 'Shingle · shingle tabs', magnet: 'Metal roof · magnets' };
const YELLOW = '#FACC15';
const secName = (sides, si) => sides[si]?.label || `Section ${si + 1}`;
const GREEN = '#00DF00';
const ptsOf = (l) => l.pts || [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
const P = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

// Number badge, filled with the wire color.
export function StrandNo({ no, wire, size = 36, done = false }) {
  const dark = wire !== 'white';
  return (
    <span className="shrink-0 rounded-full font-extrabold flex items-center justify-center border-2"
      style={{ width: size, height: size, fontSize: size * 0.45, background: wireHex(wire), color: dark ? '#fff' : '#000', borderColor: done ? GREEN : dark ? '#ffffff66' : '#00000033' }}>
      {done ? '✓' : no}
    </span>
  );
}

// Big strand numbers on a plan photo. marks = [{ run, no, wire, done }] for this photo.
export function StrandMarks({ marks, w, h }) {
  const r = Math.max(w, h) / 40;
  return marks.map(({ run, no, wire, done }) => {
    const longest = run.pieces.reduce((a, p) => (Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) > Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) ? p : a), run.pieces[0]);
    if (!longest) return null;
    const x = (longest.a.x + longest.b.x) / 2, y = (longest.a.y + longest.b.y) / 2 - r * 1.6;
    const fg = wire === 'white' ? '#000' : '#fff';
    return (
      <g key={run.key}>
        <circle cx={x} cy={y} r={r} fill={done ? GREEN : wireHex(wire)} stroke={wire === 'white' ? '#000' : '#fff'} strokeWidth={r / 6} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.15} fontWeight="800" fill={done ? '#000' : fg}>{no}</text>
      </g>
    );
  });
}

// One photo with this strand's lines on it lit up (the one being measured brightest).
function StrandPhoto({ side, si, strand, cur, wire, piece, label }) {
  const w = side.w || 1600, h = side.h || 1200;
  const sw = Math.max(w, h) / 170;
  const r = Math.max(w, h) / 42;
  const mine = new Set(strand.runs.filter((x) => x.si === si).map((x) => x.li));
  const zips = new Set(strand.runs.filter((x) => x.si === si).flatMap((x) => x.zips));
  const outline = wire === 'white' ? '#000' : '#fff';
  return (
    <div className="relative">
      <img src={side.plain} alt="" decoding="async" loading="lazy" className="block w-full bg-white/5" style={{ aspectRatio: `${w} / ${h}` }} />
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
        <rect x="0" y="0" width={w} height={h} fill="#000" opacity="0.45" />
        {(side.lines || []).map((l, li) => !mine.has(li) && (
          <polyline key={li} points={P(ptsOf(l))} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={sw * 0.6} strokeLinecap="round" />
        ))}
        {(side.jumps || []).map((z, zi) => (
          <polyline key={`z${zi}`} points={P(ptsOf(z))} fill="none" stroke={zips.has(zi) ? '#FB923C' : '#fff'} strokeOpacity={zips.has(zi) ? 1 : 0.2} strokeWidth={sw * 0.7} strokeDasharray={`${sw * 0.3} ${sw * 1.2}`} strokeLinecap="round" />
        ))}
        {strand.runs.filter((x) => x.si === si).map((x) => (
          <g key={x.key} opacity={x.key === cur?.key ? 1 : 0.75}>
            <polyline points={P(x.pts)} fill="none" stroke={outline} strokeWidth={sw * 3.4} strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            <polyline points={P(x.pts)} fill="none" stroke={wireHex(wire)} strokeWidth={sw * 2.2} strokeLinecap="round" strokeLinejoin="round" />
            {x.line.ends && <EndMarks pts={x.pts} a={x.line.ends.a} b={x.line.ends.b} w={w} h={h} color={wireHex(wire)} />}
          </g>
        ))}
        {cur && cur.si === si && cur.pieces.length > 1 && cur.pieces.map((p, k) => {
          const x = p.mid ? p.mid.x : (p.a.x + p.b.x) / 2, y = p.mid ? p.mid.y : (p.a.y + p.b.y) / 2;
          const on = k === piece;
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={r} fill={on ? YELLOW : '#000'} stroke={on ? '#000' : YELLOW} strokeWidth={r / 5} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.1} fontWeight="800" fill={on ? '#000' : YELLOW}>{k + 1}</text>
            </g>
          );
        })}
        {[...(side.outlets || []).map((p) => [p, '🔌']), ...(side.inlines || []).map((p) => [p, '⚡'])].map(([p, icon], k) => (
          <text key={`p${k}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.6}>{icon}</text>
        ))}
      </svg>
      {label && <span className="absolute top-2 left-2 rounded-lg bg-black/75 px-2 py-1 text-sm font-bold">{label}</span>}
    </div>
  );
}

// Phone as an angle finder: long edge along the roof edge → degrees off level.
function AngleMeter({ onLock, onClose }) {
  const [deg, setDeg] = useState(null);
  const [err, setErr] = useState('');
  const smooth = useRef(null);
  useEffect(() => {
    let on = true;
    const handler = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      const n = Math.hypot(g.x, g.y, g.z);
      if (!n) return;
      const d = (Math.asin(Math.min(1, Math.abs(g.y) / n)) * 180) / Math.PI;
      smooth.current = smooth.current == null ? d : smooth.current * 0.8 + d * 0.2;
      if (on) setDeg(smooth.current);
    };
    (async () => {
      try {
        if (typeof window.DeviceMotionEvent?.requestPermission === 'function') {
          const r = await window.DeviceMotionEvent.requestPermission();
          if (r !== 'granted') { setErr('Motion access was blocked. Close Safari tabs and try again, or type the angle.'); return; }
        }
        if (!('DeviceMotionEvent' in window)) { setErr('This phone can’t read angles here. Type the angle instead.'); return; }
        window.addEventListener('devicemotion', handler);
        setTimeout(() => { if (on && smooth.current == null) setErr('No reading. Use your phone (not a computer), or type the angle.'); }, 2500);
      } catch { setErr('Couldn’t start the angle finder. Type the angle instead.'); }
    })();
    return () => { on = false; window.removeEventListener('devicemotion', handler); };
  }, []);
  const d = deg == null ? null : Math.round(deg * 2) / 2;
  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col items-center justify-between p-6 text-white">
      <p className="text-center text-lg font-bold leading-snug pt-4">Line the phone’s <span style={{ color: YELLOW }}>long edge</span> up with the roof edge.<span className="block text-base font-normal text-white/60 mt-1">Lay it on the edge, or hold it up and match the slope by eye.</span></p>
      <div className="flex flex-col items-center gap-4">
        <div className="w-64 h-64 rounded-full border-4 border-white/15 flex items-center justify-center relative overflow-hidden">
          <div className="absolute left-0 right-0 h-1 rounded-full" style={{ background: YELLOW, transform: `rotate(${-(d || 0)}deg)` }} />
          <div className="relative bg-black/70 rounded-2xl px-4 py-2 text-center">
            <p className="text-6xl font-extrabold tabular-nums">{d == null ? '—' : `${d}°`}</p>
            {d != null && <p className="text-base text-white/70">≈ {pitchOf(d)}/12 pitch</p>}
          </div>
        </div>
        {err && <p className="text-center text-red-300 font-semibold">{err}</p>}
      </div>
      <div className="w-full max-w-sm space-y-3 pb-4">
        <button disabled={d == null} onClick={() => onLock(String(d))} className="w-full h-16 rounded-2xl text-black text-xl font-extrabold disabled:opacity-30 cursor-pointer" style={{ background: GREEN }}>Lock {d != null ? `${d}°` : ''}</button>
        <button onClick={onClose} className="w-full h-12 rounded-2xl bg-white/10 text-base font-bold cursor-pointer">Cancel</button>
      </div>
    </div>
  );
}

const Num = ({ value, onChange, placeholder, wide = false }) => (
  <input value={value} inputMode="decimal" placeholder={placeholder}
    onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
    className={`${wide ? 'w-28' : 'w-24'} h-14 rounded-xl border-2 border-white/20 bg-black px-2 text-2xl font-extrabold text-center outline-none focus:border-[#00DF00]`} />
);

// Pick other strands to join into this one (same wire).
function JoinPicker({ strand, strands, sides, jobWire, onJoin, onClose }) {
  const others = strands.filter((x) => x.id !== strand.id);
  return (
    <div className="fixed inset-0 z-[70] bg-[#0b0b0d] text-white overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#0b0b0d]/95 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-lg font-extrabold leading-tight">Same wire as Strand {strand.no}?<span className="block text-sm font-normal text-white/60">Tap the strand that keeps going on this wire.</span></p>
          <button onClick={onClose} className="w-12 h-12 rounded-xl bg-white/10 text-xl cursor-pointer">✕</button>
        </div>
      </div>
      <div className="mx-auto max-w-3xl p-4 grid grid-cols-2 gap-3">
        {others.map((x) => {
          const r = x.runs[0];
          const hooked = strand.neighbors.some((n) => n.no === x.no);
          return (
            <button key={x.id} onClick={() => onJoin(x.id)} className={`rounded-2xl overflow-hidden border-2 text-left cursor-pointer active:opacity-70 ${hooked ? 'border-[#00DF00]/70' : 'border-white/10'}`}>
              <StrandPhoto side={sides[r.si]} si={r.si} strand={x} cur={null} wire={wireOf(x, jobWire)} piece={-1} />
              <div className="flex items-center gap-2 p-2">
                <StrandNo no={x.no} wire={wireOf(x, jobWire)} size={30} />
                <span className="text-sm font-bold leading-tight">Strand {x.no}<span className="block font-normal text-white/60">{hooked ? 'hooks to it' : `section ${[...new Set(x.runs.map((y) => y.si + 1))].join('+')}`}</span></span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StrandSheet({ strand, strands, idx, sides, jobWire, partsOf, onParts, zipFt, onZip, onDone, onJoin, onSplit, onPrev, onNext, onClose, saveState, labelOf }) {
  const [meter, setMeter] = useState(null); // { key, k } the angle finder is filling
  const [focus, setFocus] = useState({ key: strand.runs[0].key, k: 0 });
  const [picking, setPicking] = useState(false);
  const wire = wireOf(strand, jobWire);
  const total = strands.length;
  const curParts = (r) => { const p = partsOf(r.key); return p?.length === r.pieces.length ? p : blankParts(r); };
  const set = (r, k, patch) => onParts(r.key, curParts(r).map((p, j) => (j === k ? { ...p, ...patch } : p)));
  const tot = groupTotal(strand, (k) => curParts(strand.runs.find((r) => r.key === k)));
  const plan = groupPlan(strand);
  const off = tot != null && plan > 0 && Math.abs(tot - plan) >= 5;
  // Same pitch is usual on both sides of a gable: fill the other empty slope pieces of that roof line too.
  const lockAngle = ({ key, k }, d) => {
    const r = strand.runs.find((x) => x.key === key);
    onParts(key, curParts(r).map((p, j) => (j === k || (p.m === 's' && p.deg === '') ? { ...p, m: 's', deg: d } : p)));
    setMeter(null);
  };
  const sis = [...new Set(strand.runs.map((r) => r.si))];
  const cur = strand.runs.find((r) => r.key === focus.key) || strand.runs[0];
  const zipList = sis.flatMap((si) => [...new Set(strand.runs.filter((r) => r.si === si).flatMap((r) => r.zips))].map((zi) => [si, zi]));

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b0b0d] text-white overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#0b0b0d]/95 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-4 py-3">
          <StrandNo no={strand.no} wire={wire} size={44} />
          <div className="flex-1 min-w-0">
            <p className="text-xl font-extrabold leading-tight">Strand {strand.no} <span className="text-white/50 font-normal text-base">of {total}</span></p>
            <p className="text-sm text-white/70">{sis.map((si) => secName(sides, si)).join(' + ')}{strand.runs.length > 1 && !strand.crew ? ` · ${strand.runs.length} roof lines` : ''}</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-xl bg-white/10 text-xl cursor-pointer">✕</button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl pb-32">
        <div className="sm:px-4 sm:pt-3 space-y-1">
          {sis.map((si) => (
            <div key={si} className="sm:rounded-2xl overflow-hidden">
              <StrandPhoto side={sides[si]} si={si} strand={strand} cur={cur} wire={wire} piece={focus.k} label={sis.length > 1 ? secName(sides, si) : ''} />
            </div>
          ))}
        </div>

        <div className="px-4 pt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-base font-bold">
              <span className="w-5 h-5 rounded-full border border-white/50" style={{ background: wireHex(wire) }} />{wireName(wire)} wire
            </span>
            {!strand.crew && [...new Set(strand.runs.map((r) => r.line.mount || 'gutter'))].map((m) => (
              <span key={m} className="rounded-xl bg-white/10 px-3 py-2 text-base font-semibold">{MOUNT[m] || MOUNT.gutter}</span>
            ))}
          </div>

          {/* Hooks to */}
          {strand.crew ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-base"><b className="text-yellow-300">M</b> = male end (plugs in) · <b className="text-pink-400">F</b> = female end{strand.runs.length > 1 ? ' · ➜ = keeps going, all parts add up to this one strand' : ''}{strand.open ? <span className="block text-yellow-300 font-semibold pt-1">Not finished — it ends in ➜. Draw where it keeps going, or tap the line and pick F.</span> : null}</p>
          ) : <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
            <p className="text-sm font-bold uppercase tracking-wide text-white/60">Hooks to</p>
            {strand.power && <p className="text-base font-bold text-yellow-300">{strand.power.kind === 'outlet' ? '🔌 Plugs in at the outlet' : '⚡ Power comes in here'} — start here</p>}
            {strand.neighbors.map((n) => (
              <p key={n.no} className="text-base font-semibold"><span style={{ color: GREEN }}>━</span> Strand {n.no} <span className="text-white/60 font-normal">{n.how === 'zip' ? 'by zip cord' : 'touches it'}</span></p>
            ))}
            {!strand.power && !strand.neighbors.length && <p className="text-base text-white/60">Nothing drawn touching it. Ask Jude where it gets power.</p>}
            {zipList.map(([si, zi]) => (
              <label key={`${si}-${zi}`} className="flex items-center gap-3 pt-1">
                <span className="flex-1 text-base font-semibold" style={{ color: '#FB923C' }}>┅ Zip cord{sis.length > 1 ? ` (sec ${si + 1})` : ''}<span className="text-white/50 font-normal text-sm"> ft (optional)</span></span>
                <Num value={zipFt(si, zi)} onChange={(v) => onZip(si, zi, v)} placeholder="ft" />
              </label>
            ))}
            <button onClick={() => setPicking(true)} className="w-full h-12 mt-1 rounded-xl border-2 border-dashed border-white/25 text-base font-bold cursor-pointer active:bg-white/10">＋ Join another strand onto this wire</button>
          </div>}

          {/* Each roof line in this strand, its pieces */}
          {strand.runs.map((r, ri) => (
            <div key={r.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-bold uppercase tracking-wide text-white/60">
                  {strand.runs.length > 1 ? `${strand.crew ? 'Part' : 'Roof line'} ${ri + 1} of ${strand.runs.length}` : 'Measure it'}{sis.length > 1 ? ` · ${secName(sides, r.si).toLowerCase()}` : ''}<span className="normal-case font-normal">{r.line.feet ? ` · plan ${r.line.feet} ft` : ''}</span>
                </p>
                {strand.runs.length > 1 && !strand.crew && <button onClick={() => onSplit(r.key)} className="h-9 px-3 rounded-lg bg-white/10 text-sm font-bold cursor-pointer">Split off</button>}
              </div>
              {curParts(r).map((p, k) => {
                const ft = pieceFeet(p);
                const on = focus.key === r.key && focus.k === k;
                return (
                  <div key={k} onFocus={() => setFocus({ key: r.key, k })} onClick={() => setFocus({ key: r.key, k })}
                    className={`rounded-2xl border-2 p-3 space-y-3 ${on ? 'border-yellow-400/80 bg-yellow-400/[0.06]' : 'border-white/10 bg-white/[0.04]'}`}>
                    <div className="flex items-center gap-2">
                      {r.pieces.length > 1 && <span className="w-8 h-8 rounded-full text-black font-extrabold flex items-center justify-center" style={{ background: YELLOW }}>{k + 1}</span>}
                      <div className="flex rounded-xl bg-black p-1 gap-1">
                        {[['t', '━ Flat'], ['s', '◢ Slope']].map(([m, label]) => (
                          <button key={m} onClick={() => set(r, k, m === 's' ? { m, run: p.run ?? '', deg: p.deg ?? '' } : { m, ft: p.ft ?? '' })}
                            className={`h-10 px-4 rounded-lg text-base font-bold cursor-pointer ${p.m === m ? 'bg-white text-black' : 'text-white/70'}`}>{label}</button>
                        ))}
                      </div>
                      <span className="ml-auto text-2xl font-extrabold tabular-nums">{ft != null ? `${fmt(ft)} ft` : ''}</span>
                    </div>
                    {r.pieces[k]?.peak && p.m === 's' && <p className="text-base font-bold text-yellow-300">▲ Peak: tape the flat bottom corner to corner (both sides together), one angle.</p>}
                    {p.m === 's' ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="space-y-1"><span className="block text-sm text-white/70">{r.pieces[k]?.peak ? 'Whole bottom, ft' : 'Flat bottom, ft'}</span><Num value={p.run} onChange={(v) => set(r, k, { run: v })} placeholder="ft" /></label>
                        <label className="space-y-1"><span className="block text-sm text-white/70">Angle °</span><Num value={p.deg} onChange={(v) => set(r, k, { deg: v })} placeholder="°" /></label>
                        <button onClick={() => { setFocus({ key: r.key, k }); setMeter({ key: r.key, k }); }} className="h-14 px-4 rounded-xl text-black text-base font-extrabold cursor-pointer" style={{ background: YELLOW }}>📱 Get angle</button>
                        {p.deg !== '' && Number(p.deg) > 0 && <span className="text-sm text-white/60 pb-1">≈ {pitchOf(Number(p.deg))}/12</span>}
                      </div>
                    ) : (
                      <label className="flex items-center gap-3"><span className="text-sm text-white/70">Tape it, ft</span><Num value={p.ft} onChange={(v) => set(r, k, { ft: v })} placeholder="ft" wide /></label>
                    )}
                  </div>
                );
              })}
              {strand.runs.length > 1 && strandTotal(curParts(r)) != null && <p className="text-right text-sm text-white/60">this {strand.crew ? 'part' : 'roof line'}: <b className="text-white">{fmt(strandTotal(curParts(r)))} ft</b></p>}
            </div>
          ))}
        </div>
      </div>

      {/* Total + next */}
      <div className="fixed bottom-0 inset-x-0 z-10 bg-[#0b0b0d]/95 backdrop-blur border-t border-white/10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <button onClick={onPrev} disabled={idx === 0} className="w-12 h-14 rounded-xl bg-white/10 text-2xl font-bold disabled:opacity-25 cursor-pointer">‹</button>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-extrabold tabular-nums leading-tight">{tot != null ? `${fmt(tot)} ft` : '— ft'}</p>
            <p className={`text-sm ${off ? 'text-yellow-300 font-semibold' : 'text-white/60'}`}>
              {plan ? `plan ${fmt(plan)} ft` : strand.crew ? '' : 'no plan ft'}{tot != null ? `${plan || !strand.crew ? ' · ' : ''}${Math.ceil(tot)} sockets` : ''}{off ? ` · off ${fmt(Math.abs(tot - plan))}` : ''}
            </p>
            {saveState && <p className={`text-xs ${saveState === 'error' ? 'text-red-400' : 'text-white/50'}`}>{labelOf(saveState)}</p>}
          </div>
          <button onClick={() => { onDone(); if (idx === total - 1) onClose(); else onNext(); }}
            className="h-14 px-5 rounded-xl text-black text-lg font-extrabold cursor-pointer" style={{ background: GREEN }}>
            {idx === total - 1 ? 'Done ✓' : 'Done · next ›'}
          </button>
        </div>
      </div>

      {meter && <AngleMeter onLock={(d) => lockAngle(meter, d)} onClose={() => setMeter(null)} />}
      {picking && <JoinPicker strand={strand} strands={strands} sides={sides} jobWire={jobWire} onJoin={(id) => { onJoin(id); setPicking(false); }} onClose={() => setPicking(false)} />}
    </div>
  );
}
