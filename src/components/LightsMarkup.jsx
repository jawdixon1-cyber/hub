import { useEffect, useRef, useState } from 'react';
import { Undo2, Trash2, Check, X, Triangle, Ruler, Wand2 } from 'lucide-react';
import { LEVEL_COLOR } from '../lib/lightsLevels';

// Draw roofline measurements on a house photo: drag to draw a line, type the
// feet, tap Easy / Medium / Hard. Lines are stored in image pixels.

const LEVELS = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

const ftOf = (l) => Number(l.feet) || 0;

// Pitch helper: sloped length = flat distance across × √(1 + (pitch/12)²).
const PITCHES = [3, 4, 5, 6, 7, 8, 9, 10, 12];
const slopeFactor = (p) => Math.sqrt(1 + (p / 12) ** 2);
// Little roof outline for a pitch button: a gable with that slope.
function PitchIcon({ p, on }) {
  const run = 14;
  const rise = (run * p) / 12;
  const h = 18;
  const base = h - 1;
  return (
    <svg width={2 * run + 4} height={h} viewBox={`0 0 ${2 * run + 4} ${h}`} className="block mx-auto">
      <polyline points={`2,${base} ${2 + run},${base - rise} ${2 + 2 * run},${base}`} fill={on ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)'} stroke={on ? '#000' : '#d4d4d4'} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

// Rough pitch from the drawn line's steepest run (only right if the photo is straight-on).
function pitchFromLine(pts) {
  let best = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i].x - pts[i - 1].x);
    const dy = Math.abs(pts[i].y - pts[i - 1].y);
    if (dx > 2) best = Math.max(best, (dy / dx) * 12);
  }
  return best >= 1 ? Math.round(best) : 0;
}

// A line is a run of points: { pts: [{x,y}, ...], feet, level }. Older
// straight lines ({x1,y1,x2,y2}) are converted on the way in.
const ptsOf = (l) => l.pts || [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
const normalize = (l) => ({ feet: l.feet, level: l.level, pts: ptsOf(l) });
const ptStr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

// Label goes at the middle of the longest straight run.
function labelAt(pts) {
  let best = { len: -1, x: pts[0].x, y: pts[0].y };
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len > best.len) best = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
  }
  return best;
}

export function LinesOverlay({ lines, w, h, selected = -1, onSelect, onHandle, scale = 1, ppx = 1 }) {
  // ppx = photo pixels per screen pixel, so handles are the same size on screen for any photo
  const u = ppx;
  const sw = Math.max(2, Math.round(Math.max(w, h) / 450)) * scale;
  const fs = Math.max(16, Math.round(Math.max(w, h) / 45)) * scale;
  return (
    <>
      {lines.map((l, i) => {
        const pts = ptsOf(l);
        const c = LEVEL_COLOR[l.level];
        const { x: mx, y: my } = labelAt(pts);
        const text = l.feet ? `${l.feet} ft` : '? ft';
        const tw = text.length * fs * 0.6 + fs * 0.6;
        const on = i === selected;
        return (
          <g key={i}>
            <g onPointerDown={onSelect ? (e) => { e.stopPropagation(); onSelect(i); } : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }}>
              {onSelect && <polyline points={ptStr(pts)} fill="none" stroke="transparent" strokeWidth={Math.max(sw * 5, 18 * u)} />}
              <polyline points={ptStr(pts)} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth={sw * 2} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={ptStr(pts)} fill="none" stroke={c} strokeWidth={on ? sw * 1.6 : sw} strokeLinecap="round" strokeLinejoin="round" />
              <rect x={mx - tw / 2} y={my - fs * 1.9} width={tw} height={fs * 1.4} rx={fs * 0.35} fill={c} stroke={on ? '#fff' : 'none'} strokeWidth={sw / 2} />
              <text x={mx} y={my - fs * 0.85} textAnchor="middle" fontSize={fs} fontWeight="700" fontFamily="Arial, sans-serif" fill="#000">{text}</text>
            </g>
            {/* Dots: drag any of them to move that point */}
            {on && onHandle && pts.map((p, j) => (
              <g key={`d${j}`} onPointerDown={(e) => { e.stopPropagation(); onHandle(e, i, j, 'move'); }} style={{ cursor: 'move' }}>
                <circle cx={p.x} cy={p.y} r={14 * u} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={5 * u} fill="#fff" stroke={c} strokeWidth={2 * u}>
                  <title>Drag to move this point</title>
                </circle>
              </g>
            ))}
            {/* Plus just past each end: drag it to keep the line going */}
            {on && onHandle && [0, pts.length - 1].map((j) => {
              const p = pts[j];
              const nb = pts[j === 0 ? 1 : pts.length - 2];
              const len = Math.hypot(p.x - nb.x, p.y - nb.y) || 1;
              const off = 24 * u;
              const px = p.x + ((p.x - nb.x) / len) * off;
              const py = p.y + ((p.y - nb.y) / len) * off;
              const r = 9 * u;
              return (
                <g key={`p${j}`} onPointerDown={(e) => { e.stopPropagation(); onHandle(e, i, j, 'extend'); }} style={{ cursor: 'copy' }}>
                  <circle cx={px} cy={py} r={14 * u} fill="transparent" />
                  <circle cx={px} cy={py} r={r} fill={c} stroke="#000" strokeOpacity="0.5" strokeWidth={1.5 * u} />
                  <path d={`M${px - r * 0.55},${py} H${px + r * 0.55} M${px},${py - r * 0.55} V${py + r * 0.55}`} stroke="#000" strokeWidth={2.5 * u} strokeLinecap="round" />
                  <title>Drag to keep the line going</title>
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );
}

export default function LightsMarkup({ photo, initialLines = [], initialScale = 0, onSave, onClose }) {
  const [size, setSize] = useState(null); // natural image size
  const [lines, setLines] = useState(() => initialLines.map(normalize));
  const [history, setHistory] = useState([]); // earlier versions of `lines`, for Undo
  const [draft, setDraft] = useState(null); // new line being dragged: { a, b }
  const [grab, setGrab] = useState(null); // dragging a dot: { i, j }
  const [sel, setSel] = useState(-1);
  const [pitchOpen, setPitchOpen] = useState(false);
  // Scale = photo pixels per foot, from a line drawn over something of known size.
  const [scale, setScale] = useState(initialScale);
  const [scaleMode, setScaleMode] = useState(false); // next drag draws the ruler
  const [ruler, setRuler] = useState(null); // { a, b } waiting for its real length
  const [rulerFt, setRulerFt] = useState('');
  const [across, setAcross] = useState('');
  const [pitch, setPitch] = useState(6);
  const [level, setLevel] = useState(() => localStorage.getItem('lights-markup-level') || 'easy');
  const svgRef = useRef(null);
  const [ppx, setPpx] = useState(1);
  const feetRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.width, h: img.height });
    img.src = photo;
  }, [photo]);

  useEffect(() => { localStorage.setItem('lights-markup-level', level); }, [level]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !size) return;
    const fit = () => { const wpx = el.getBoundingClientRect().width; if (wpx) setPpx(size.w / wpx); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  // Jump to the feet box after drawing, but never move the screen: when you're
  // pinch-zoomed in, leave focus alone so you stay right where you are.
  useEffect(() => {
    if (sel < 0) return;
    const zoomed = (window.visualViewport?.scale || 1) > 1.01;
    if (!zoomed) feetRef.current?.focus({ preventScroll: true });
  }, [sel]);

  const pt = (e) => {
    const svg = svgRef.current;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(0, Math.min(size.w, q.x)), y: Math.max(0, Math.min(size.h, q.y)) };
  };

  const commit = (next) => { setHistory((h) => [...h, lines]); setLines(next); };
  const minLen = () => Math.max(size.w, size.h) / 60;

  const down = (e) => {
    if (!size) return;
    svgRef.current.setPointerCapture(e.pointerId);
    const p = pt(e);
    setSel(-1);
    setDraft({ a: p, b: p });
  };

  // Handles on the selected line: a dot moves that point; the + past an end
  // adds a new corner and keeps the line going.
  const onHandle = (e, i, j, mode) => {
    svgRef.current.setPointerCapture(e.pointerId);
    const pts = lines[i].pts;
    if (mode === 'extend') {
      const p = { ...pts[j] };
      const nextPts = j === 0 ? [p, ...pts] : [...pts, p];
      commit(lines.map((l, k) => (k === i ? { ...l, pts: nextPts } : l)));
      setGrab({ i, j: j === 0 ? 0 : nextPts.length - 1, extend: true });
    } else {
      commit(lines);
      setGrab({ i, j });
    }
  };

  const move = (e) => {
    if (!size) return;
    if (grab) {
      const p = pt(e);
      setLines((ls) => ls.map((l, k) => (k === grab.i ? { ...l, pts: l.pts.map((q, m) => (m === grab.j ? p : q)) } : l)));
    } else if (draft) {
      const p = pt(e);
      setDraft((d) => ({ ...d, b: p }));
    }
  };

  const up = () => {
    if (grab) {
      // A click on an end dot without dragging shouldn't leave a stacked point.
      if (grab.extend) {
        const l = lines[grab.i];
        const nb = grab.j === 0 ? l.pts[1] : l.pts[l.pts.length - 2];
        const p = l.pts[grab.j];
        if (Math.hypot(p.x - nb.x, p.y - nb.y) < minLen()) {
          setLines((ls) => ls.map((x, k) => (k === grab.i ? { ...x, pts: x.pts.filter((_, m) => m !== grab.j) } : x)));
          setHistory((h) => h.slice(0, -1));
        }
      }
      setGrab(null);
      return;
    }
    if (!draft) return;
    if (scaleMode) {
      if (Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) > minLen()) setRuler(draft);
      setScaleMode(false);
      setDraft(null);
      return;
    }
    if (Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) > minLen()) {
      commit([...lines, { pts: [draft.a, draft.b], feet: '', level }]);
      setSel(lines.length);
    }
    setDraft(null);
  };

  const edit = (patch) => setLines((ls) => ls.map((l, i) => (i === sel ? { ...l, ...patch } : l)));

  const lenPx = (pts) => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
  const estimate = (l) => (scale ? Math.max(1, Math.round(lenPx(l.pts) / scale)) : 0);
  const applyRuler = (ft) => {
    const f = Number(ft);
    if (!ruler || !(f > 0)) return;
    setScale(lenPx([ruler.a, ruler.b]) / f);
    setRuler(null);
    setRulerFt('');
  };
  const estimateAll = () => setLines((ls) => ls.map((l) => (Number(l.feet) > 0 ? l : { ...l, feet: String(estimate(l)) })));
  const remove = () => { commit(lines.filter((_, i) => i !== sel)); setSel(-1); };
  const undo = () => {
    if (!history.length) return;
    setLines(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSel(-1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSel(-1);
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel >= 0 && document.activeElement !== feetRef.current) remove();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const totals = { easy: 0, medium: 0, hard: 0 };
  lines.forEach((l) => { totals[l.level] += ftOf(l); });
  const cur = sel >= 0 ? lines[sel] : null;
  const missing = lines.filter((l) => !ftOf(l)).length;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#141414] border-b border-[#2e2e2e]">
        <span className="text-sm text-neutral-400 mr-1">Draw as</span>
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => { setLevel(l.key); if (cur) edit({ level: l.key }); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer ${level === l.key ? 'text-black' : 'text-neutral-300 border-[#2e2e2e]'}`}
            style={level === l.key ? { background: LEVEL_COLOR[l.key], borderColor: LEVEL_COLOR[l.key] } : undefined}
          >
            {l.label}
          </button>
        ))}
        <button onClick={undo} disabled={!history.length} className="ml-3 inline-flex items-center gap-1 text-sm text-neutral-300 hover:text-white disabled:opacity-30 cursor-pointer"><Undo2 size={15} /> Undo</button>
        <button
          onClick={() => { setScaleMode((m) => !m); setSel(-1); }}
          className={`ml-3 inline-flex items-center gap-1 text-sm cursor-pointer ${scaleMode ? 'text-[#B0FF03]' : scale ? 'text-neutral-300 hover:text-white' : 'text-yellow-400 hover:text-yellow-300'}`}
          title="Drag across something you know the size of (like a garage door) so Hub can estimate feet"
        >
          <Ruler size={15} /> {scaleMode ? 'Drag across a garage door…' : scale ? 'Scale set' : 'Set scale'}
        </button>
        {scale > 0 && lines.some((l) => !(Number(l.feet) > 0)) && (
          <button onClick={estimateAll} className="ml-2 inline-flex items-center gap-1 text-sm text-neutral-300 hover:text-white cursor-pointer"><Wand2 size={15} /> Estimate all</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-neutral-300 hover:text-white cursor-pointer"><X size={15} className="inline -mt-0.5" /> Cancel</button>
          <button onClick={() => onSave(lines, size, scale)} className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#B0FF03] text-black cursor-pointer"><Check size={15} className="inline -mt-0.5" /> Done</button>
        </div>
      </div>

      {/* Photo + lines */}
      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4">
        {size ? (
          <div className="relative inline-block">
            <img src={photo} alt="House" className={`block max-w-full select-none pointer-events-none ${(cur && pitchOpen) || ruler ? 'max-h-[calc(100vh-260px)]' : 'max-h-[calc(100vh-140px)]'}`} draggable={false} />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${size.w} ${size.h}`}
              className="absolute inset-0 w-full h-full touch-none"
              style={{ cursor: 'crosshair' }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
            >
              <LinesOverlay lines={lines} w={size.w} h={size.h} selected={sel} onSelect={setSel} onHandle={onHandle} ppx={ppx} />
              {ruler && <line x1={ruler.a.x} y1={ruler.a.y} x2={ruler.b.x} y2={ruler.b.y} stroke="#fff" strokeWidth={Math.max(2, Math.round(Math.max(size.w, size.h) / 450))} strokeDasharray="6 6" strokeLinecap="round" />}
              {draft && <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke={scaleMode ? '#fff' : LEVEL_COLOR[level]} strokeWidth={Math.max(2, Math.round(Math.max(size.w, size.h) / 450))} strokeDasharray="12 8" strokeLinecap="round" />}
            </svg>

          </div>
        ) : (
          <p className="text-neutral-400">Loading photo…</p>
        )}
      </div>

      {/* Scale: how long is the thing you just measured? */}
      {ruler && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 bg-[#1b1b1b] border-t border-[#2e2e2e] text-sm" onPointerDown={(e) => e.stopPropagation()}>
          <span className="text-neutral-300">How long is that?</span>
          {[['Double garage door', 16], ['Single garage door', 9], ['Front door', 3]].map(([label, ft]) => (
            <button key={label} onClick={() => applyRuler(ft)} className="px-2.5 h-8 rounded-md text-xs font-bold bg-[#2a2a2a] text-neutral-200 hover:text-white cursor-pointer">
              {label} · {ft} ft
            </button>
          ))}
          <input
            value={rulerFt}
            inputMode="decimal"
            placeholder="other ft"
            onChange={(e) => setRulerFt(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') applyRuler(rulerFt); }}
            className="w-24 rounded-md border border-[#404040] bg-black px-2 py-1 text-white text-center outline-none focus:border-[#B0FF03] select-text"
          />
          <button onClick={() => applyRuler(rulerFt)} disabled={!(Number(rulerFt) > 0)} className="px-3 h-8 rounded-md bg-[#B0FF03] text-black text-xs font-bold disabled:opacity-40 cursor-pointer">Set</button>
          <button onClick={() => setRuler(null)} className="ml-auto text-xs text-neutral-400 hover:text-white cursor-pointer">Cancel</button>
        </div>
      )}

      {/* Pitch helper: flat distance across + pitch → real sloped length */}
      {cur && pitchOpen && (() => {
        const flat = Number(across) || 0;
        const sloped = flat * slopeFactor(pitch);
        const guess = pitchFromLine(cur.pts);
        const steep = pitch >= 8;
        return (
          <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-[#1b1b1b] border-t border-[#2e2e2e] text-sm" onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-neutral-400">Measured across</span>
            <input
              value={across}
              inputMode="decimal"
              placeholder="ft"
              onChange={(e) => setAcross(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-20 rounded-md border border-[#404040] bg-black px-2 py-1 text-white font-bold text-center outline-none focus:border-[#B0FF03] select-text"
            />
            <span className="text-neutral-400">ft · pitch</span>
            <div className="flex gap-1">
              {PITCHES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPitch(p)}
                  className={`px-1.5 pt-1 pb-0.5 rounded-md text-[11px] font-bold cursor-pointer ${pitch === p ? 'bg-[#B0FF03] text-black' : 'bg-[#2a2a2a] text-neutral-300 hover:text-white'}`}
                >
                  <PitchIcon p={p} on={pitch === p} />
                  {p}/12
                </button>
              ))}
            </div>
            {guess > 0 && (
              <button onClick={() => setPitch(Math.min(12, Math.max(3, guess)))} className="text-xs text-neutral-400 hover:text-white underline cursor-pointer" title="Read from the line you drew — only right if the photo is straight-on">
                from photo ≈ {guess}/12
              </button>
            )}
            <span className="ml-auto text-neutral-300">
              Sloped: <b className="text-white text-base">{flat ? `${Math.round(sloped * 10) / 10} ft` : '—'}</b>
              {steep && <span className="ml-2 text-[11px] text-red-400">steep — likely Hard</span>}
            </span>
            <button
              disabled={!flat}
              onClick={() => { edit({ feet: String(Math.round(sloped * 10) / 10) }); setPitchOpen(false); }}
              className="px-3 h-8 rounded-md bg-[#B0FF03] text-black text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              Use {flat ? `${Math.round(sloped * 10) / 10} ft` : ''}
            </button>
          </div>
        );
      })()}

      {/* Bottom totals */}
      <div className="flex items-center gap-4 px-4 py-3 bg-[#141414] border-t border-[#2e2e2e] text-sm">
        {cur ? (
          <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-neutral-400">This line:</span>
            <input
              ref={feetRef}
              value={cur.feet}
              inputMode="decimal"
              placeholder="ft"
              onChange={(e) => edit({ feet: e.target.value.replace(/[^0-9.]/g, '') })}
              onKeyDown={(e) => { if (e.key === 'Enter') setSel(-1); }}
              className="w-20 rounded-md border border-[#404040] bg-black px-2 py-1 text-white text-base font-bold text-center outline-none focus:border-[#B0FF03] select-text"
            />
            <span className="text-neutral-400">ft</span>
            <button
              onClick={() => (scale ? edit({ feet: String(estimate(cur)) }) : setScaleMode(true))}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md text-xs font-bold border border-[#404040] text-neutral-300 hover:text-white cursor-pointer"
              title={scale ? 'Estimate from the scale' : 'Set a scale first'}
            >
              <Wand2 size={13} /> {scale ? `Estimate${cur.pts ? ` ≈ ${estimate(cur)}` : ''}` : 'Estimate'}
            </button>
            {LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => { edit({ level: l.key }); setLevel(l.key); }}
                className="px-2.5 h-8 rounded-md text-xs font-bold text-black cursor-pointer"
                style={{ background: LEVEL_COLOR[l.key], outline: cur.level === l.key ? '2px solid #fff' : 'none', outlineOffset: 2 }}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => setPitchOpen((o) => !o)}
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-md text-xs font-bold border cursor-pointer ${pitchOpen ? 'border-[#B0FF03] text-[#B0FF03]' : 'border-[#404040] text-neutral-300 hover:text-white'}`}
              title="Work out a sloped length from the pitch"
            >
              <Triangle size={13} /> Pitch
            </button>
            <button onClick={remove} className="p-1.5 text-neutral-400 hover:text-red-500 cursor-pointer" title="Delete line"><Trash2 size={16} /></button>
            <button onClick={() => { setSel(-1); setPitchOpen(false); }} className="px-3 h-8 rounded-md bg-[#B0FF03] text-black text-xs font-bold cursor-pointer">OK</button>
          </div>
        ) : (
          <span className="text-neutral-400">Drag to draw. Tap a line: drag a <b className="text-white">dot</b> to move it, or drag the <b className="text-white">+</b> at an end to keep going around a corner.</span>
        )}
        <span className="ml-auto font-semibold" style={{ color: LEVEL_COLOR.easy }}>Easy {totals.easy} ft</span>
        <span className="font-semibold" style={{ color: LEVEL_COLOR.medium }}>Medium {totals.medium} ft</span>
        <span className="font-semibold" style={{ color: LEVEL_COLOR.hard }}>Hard {totals.hard} ft</span>
        {missing > 0 && <span className="text-yellow-400">{missing} line{missing > 1 ? 's' : ''} need feet</span>}
      </div>
    </div>
  );
}
