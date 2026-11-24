import { useRef, useState } from 'react';
import { strandColor } from '../lib/strands';

// Crew site photos: take a photo, tap along the lights to draw each strand, mark its ends.
// Male end = where it plugs in. Female end = where it ends. ➜ = goes around the corner into the next photo.

const GREEN = '#00DF00';
const ZIP = '#FB923C';
const P = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

// The end markers of one drawn line: M (male), F (female), ➜ in / out.
export function EndMarks({ pts, a, b, w, h, color = '#fff' }) {
  if (!pts || pts.length < 2) return null;
  const r = Math.max(w, h) / 62;
  const dot = (p, label, fill) => (
    <g>
      <circle cx={p.x} cy={p.y} r={r} fill={fill} fillOpacity="0.7" stroke="#000" strokeWidth={r / 6} />
      <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.3} fontWeight="900" fill="#000">{label}</text>
    </g>
  );
  // Arrow head at p pointing away from q.
  const arrow = (p, q) => {
    const dx = p.x - q.x, dy = p.y - q.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, s = r * 1.6;
    const tip = { x: p.x + ux * s, y: p.y + uy * s };
    const l = { x: p.x - uy * s * 0.75, y: p.y + ux * s * 0.75 };
    const rr = { x: p.x + uy * s * 0.75, y: p.y - ux * s * 0.75 };
    return <polygon points={P([tip, l, rr])} fill={color} stroke="#000" strokeWidth={r / 5} strokeLinejoin="round" />;
  };
  const n = pts.length;
  return (
    <g>
      {a === 'in' ? arrowIn(pts[0], pts[1], r, color) : dot(pts[0], 'M', '#FACC15')}
      {b === 'out' ? arrow(pts[n - 1], pts[n - 2]) : b === 'female' ? dot(pts[n - 1], 'F', '#F472B6') : null}
    </g>
  );
}
// Incoming arrow: sits on the start, pointing into the line.
function arrowIn(p, q, r, color) {
  const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, s = r * 1.6;
  const tip = { x: p.x + ux * s * 0.6, y: p.y + uy * s * 0.6 };
  const back = { x: p.x - ux * s * 0.6, y: p.y - uy * s * 0.6 };
  const l = { x: back.x - uy * s * 0.75, y: back.y + ux * s * 0.75 };
  const rr = { x: back.x + uy * s * 0.75, y: back.y - ux * s * 0.75 };
  return <polygon points={P([tip, l, rr])} fill={color} stroke="#000" strokeWidth={r / 5} strokeLinejoin="round" />;
}

// One photo with every strand drawn on it (thumbnails + the draw screen).
export function CrewPhoto({ src, w, h, lines, rankOf, sel = null, cur = null, onTap, svgRef, ftOf = null }) {
  const sw = Math.max(w, h) / 220;
  return (
    <div className="relative">
      <img src={src} alt="" decoding="async" loading="lazy" className="block w-full bg-white/5 select-none" style={{ aspectRatio: `${w} / ${h}` }} draggable={false} />
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onClick={onTap}
        className={`absolute inset-0 w-full h-full ${onTap ? 'cursor-crosshair' : 'pointer-events-none'}`}>
        {lines.map((l) => {
          const on = sel === l.id;
          if (l.k === 'zip') return (
            <g key={l.id} opacity={sel != null && !on ? 0.45 : 1}>
              <polyline points={P(l.pts)} fill="none" stroke="#000" strokeWidth={sw * (on ? 3.4 : 2.6)} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              <polyline points={P(l.pts)} fill="none" stroke={ZIP} strokeWidth={sw * (on ? 2 : 1.5)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${sw * 2.5} ${sw * 2}`} />
              <StrandTag pts={l.pts} no="Z" color={ZIP} w={w} h={h} ft={ftOf ? ftOf(l) : null} />
            </g>
          );
          const c = strandColor(rankOf(l.s));
          return (
            <g key={l.id} opacity={sel != null && !on ? 0.45 : 1}>
              <polyline points={P(l.pts)} fill="none" stroke="#000" strokeWidth={sw * (on ? 4.4 : 3.4)} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              <polyline points={P(l.pts)} fill="none" stroke={c} strokeWidth={sw * (on ? 2.8 : 2)} strokeLinecap="round" strokeLinejoin="round" />
              <EndMarks pts={l.pts} a={l.a} b={l.b} w={w} h={h} color={c} />
              <StrandTag pts={l.pts} no={rankOf(l.s)} color={c} w={w} h={h} ft={ftOf ? ftOf(l) : null} />
            </g>
          );
        })}
        {cur && cur.pts.length > 0 && (
          <g>
            <polyline points={P(cur.pts)} fill="none" stroke="#000" strokeWidth={sw * 3.4} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            <polyline points={P(cur.pts)} fill="none" stroke="#fff" strokeWidth={sw * 2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${sw * 3} ${sw * 2}`} />
            {cur.pts.map((p, k) => <circle key={k} cx={p.x} cy={p.y} r={sw * 2.2} fill={k === 0 ? '#FACC15' : '#fff'} stroke="#000" strokeWidth={sw * 0.6} />)}
          </g>
        )}
      </svg>
    </div>
  );
}
function StrandTag({ pts, no, color, w, h, ft = null }) {
  // Label in the middle of the line's longest piece.
  let best = 1, bl = -1;
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (L > bl) { bl = L; best = i; } }
  const x = (pts[best].x + pts[best - 1].x) / 2, y = (pts[best].y + pts[best - 1].y) / 2;
  const r = Math.max(w, h) / 62;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} fillOpacity="0.7" stroke="#000" strokeWidth={r / 6} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.3} fontWeight="900" fill="#000">{no}</text>
      {ft != null && (() => {
        // Feet for this line, in a pill just under the number.
        const label = ft ? `${ft} ft` : '? ft';
        const fw = r * 0.62 * label.length + r * 0.8, fy = y + r * 1.25;
        return (
          <g>
            <rect x={x - fw / 2} y={fy} width={fw} height={r * 1.3} rx={r * 0.4} fill={ft ? '#000' : '#FACC15'} opacity="0.85" />
            <text x={x} y={fy + r * 0.65} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.0} fontWeight="800" fill={ft ? '#fff' : '#000'}>{label}</text>
          </g>
        );
      })()}
    </g>
  );
}

// Full-screen: draw strands on one photo.
// photo = { pid, no, w, h, lines }, src = image url. allLines = every line in every photo (to know open strands / numbers).
export function CrewDraw({ photo, src, label, map, onSave, onClose, onDelete }) {
  const [cur, setCur] = useState(null); // { s, a, pts }
  const [sel, setSel] = useState(null); // line id
  const [sure, setSure] = useState('');
  const svgRef = useRef(null);
  const all = map.photos.flatMap((p) => p.lines).filter((l) => l.k !== 'zip');
  const ss = [...new Set(all.map((l) => l.s))].sort((a, b) => a - b);
  const rankOf = (s) => { const i = ss.indexOf(s); return i >= 0 ? i + 1 : ss.length + 1; };
  // Strands that went ➜ into another photo and haven't been picked up yet.
  const open = ss.filter((s) => all.filter((l) => l.s === s && l.b === 'out').length > all.filter((l) => l.s === s && l.a === 'in').length);
  const nextS = (ss.length ? Math.max(...ss) : 0) + 1;
  const lines = photo.lines;
  const save = (nextLines, seq = map.seq) => onSave({ ...map, seq, photos: map.photos.map((p) => (p.pid === photo.pid ? { ...p, lines: nextLines } : p)) });

  const tap = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const p = { x: Math.round(((e.clientX - r.left) / r.width) * photo.w), y: Math.round(((e.clientY - r.top) / r.height) * photo.h) };
    if (cur) { setCur({ ...cur, pts: [...cur.pts, p] }); return; }
    // Not drawing: tap a line to pick it.
    const near = Math.max(photo.w, photo.h) * 0.04;
    let best = null, bd = Infinity;
    lines.forEach((l) => l.pts.forEach((q, k) => {
      if (!k) return;
      const a = l.pts[k - 1], dx = q.x - a.x, dy = q.y - a.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
      const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (d < bd) { bd = d; best = l.id; }
    }));
    setSel(bd < near ? best : null);
    setSure('');
  };
  const finish = (b) => {
    const id = map.seq || 0;
    save([...lines, cur.zip ? { id, k: 'zip', s: 0, a: '', b: '', pts: cur.pts } : { id, v: 2, s: cur.s, a: cur.a, b, pts: cur.pts }], id + 1);
    setCur(null);
  };
  const selLine = lines.find((l) => l.id === sel);
  const btn = 'h-14 rounded-2xl text-lg font-extrabold cursor-pointer active:opacity-70';

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <p className="flex-1 text-lg font-extrabold">{label}</p>
        <button onClick={onClose} className="h-12 px-5 rounded-xl text-black text-base font-extrabold cursor-pointer" style={{ background: GREEN }}>Done</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <CrewPhoto src={src} w={photo.w} h={photo.h} lines={lines} rankOf={rankOf} sel={sel} cur={cur} onTap={tap} svgRef={svgRef} />
      </div>
      <div className="border-t border-white/10 bg-[#0b0b0d] px-4 pt-3 pb-5 space-y-2">
        {cur ? (
          <>
            {cur.zip ? (
              <>
                <p className="text-base font-bold" style={{ color: ZIP }}>┅ Zip cord: {cur.pts.length === 0 ? 'tap where it starts (a strand’s F end)' : 'tap along it to where it plugs into the next strand'}</p>
                {cur.pts.length >= 2 && <button onClick={() => finish('')} className={`${btn} w-full text-black`} style={{ background: ZIP }}>✓ Done with zip cord</button>}
              </>
            ) : (<>
            <p className="text-base font-bold">
              Strand {rankOf(cur.s)}: {cur.pts.length === 0 ? (cur.a === 'in' ? 'tap where it picks back up' : 'tap the male end (where it plugs in)') : 'keep tapping along the lights'}
            </p>
            {cur.pts.length >= 2 && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => finish('female')} className={`${btn} text-black`} style={{ background: '#F472B6' }}>F · Ends here</button>
                <button onClick={() => finish('out')} className={`${btn} bg-white text-black`}>➜ Keeps going</button>
              </div>
            )}
            {cur.pts.length >= 2 && <p className="text-sm text-white/60">➜ = no F end yet. Then tap “Strand {rankOf(cur.s)} keeps going” here or on another photo — it all adds up as one strand.</p>}
            </>)}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCur({ ...cur, pts: cur.pts.slice(0, -1) })} disabled={!cur.pts.length} className="h-12 rounded-xl bg-white/10 text-base font-bold disabled:opacity-30 cursor-pointer">↶ Undo</button>
              <button onClick={() => setCur(null)} className="h-12 rounded-xl bg-white/10 text-base font-bold cursor-pointer">Cancel</button>
            </div>
          </>
        ) : selLine?.k === 'zip' ? (
          <>
            <p className="text-base font-bold" style={{ color: ZIP }}>┅ Zip cord <span className="text-white/60 font-normal">· no lights, not in strand feet</span></p>
            <button onClick={() => { if (sure !== 'line') { setSure('line'); return; } save(lines.filter((l) => l.id !== sel)); setSel(null); setSure(''); }}
              className={`w-full h-12 rounded-xl text-base font-bold cursor-pointer ${sure === 'line' ? 'bg-red-600' : 'bg-white/10 text-red-300'}`}>{sure === 'line' ? 'Tap again to delete' : 'Delete zip cord'}</button>
            <button onClick={() => setSel(null)} className="w-full h-11 rounded-xl text-base text-white/70 cursor-pointer">Back</button>
          </>
        ) : selLine ? (
          <>
            <p className="text-base font-bold">Strand {rankOf(selLine.s)} <span className="text-white/60 font-normal">· {selLine.a === 'in' ? 'continues from ➜' : 'M = plugs in'} · {selLine.b === 'out' ? '➜ keeps going' : selLine.b === 'female' ? 'F = ends here' : 'no end'}</span></p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => save(lines.map((l) => (l.id === sel ? { ...l, b: 'female' } : l)))} className={`${btn} text-black ${selLine.b === 'female' ? '' : 'opacity-60'}`} style={{ background: '#F472B6' }}>F · Ends here</button>
              <button onClick={() => save(lines.map((l) => (l.id === sel ? { ...l, b: 'out' } : l)))} className={`${btn} bg-white text-black ${selLine.b === 'out' ? '' : 'opacity-60'}`}>➜ Keeps going</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => save(lines.map((l) => (l.id === sel ? { ...l, pts: [...l.pts].reverse() } : l)))} className="h-12 rounded-xl bg-white/10 text-base font-bold cursor-pointer">⇄ Flip ends</button>
              <button onClick={() => { if (sure !== 'line') { setSure('line'); return; } save(lines.filter((l) => l.id !== sel)); setSel(null); setSure(''); }}
                className={`h-12 rounded-xl text-base font-bold cursor-pointer ${sure === 'line' ? 'bg-red-600' : 'bg-white/10 text-red-300'}`}>{sure === 'line' ? 'Tap again to delete' : 'Delete line'}</button>
            </div>
            <button onClick={() => setSel(null)} className="w-full h-11 rounded-xl text-base text-white/70 cursor-pointer">Back</button>
          </>
        ) : (
          <>
            {open.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {open.map((s) => (
                  <button key={s} onClick={() => { const end = [...lines].reverse().find((l) => l.s === s && l.b === 'out'); setCur({ s, a: 'in', pts: end ? [end.pts[end.pts.length - 1]] : [] }); }} className="h-14 px-4 rounded-2xl text-black text-base font-extrabold cursor-pointer" style={{ background: strandColor(rankOf(s)) }}>➜ Strand {rankOf(s)} keeps going here</button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <button onClick={() => setCur({ s: nextS, a: 'male', pts: [] })} className={`${btn} text-black`} style={{ background: GREEN }}>＋ Draw Strand {ss.length + 1}</button>
              <button onClick={() => setCur({ zip: true, pts: [] })} className={`${btn} text-black`} style={{ background: ZIP }}>┅ Zip cord</button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/60">{lines.length ? 'Tap a line to change it.' : 'M = male · F = female · ➜ = keeps going (same strand) · ┅ = zip cord'}</p>
              <button onClick={() => { if (sure !== 'photo') { setSure('photo'); return; } onDelete(); }}
                className={`h-10 px-3 rounded-lg text-sm font-bold cursor-pointer ${sure === 'photo' ? 'bg-red-600' : 'text-red-300'}`}>{sure === 'photo' ? 'Tap again — delete photo' : 'Delete photo'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
