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
// mount: 'gutter' (flex clips), 'guard' (gutter guard → shingle tabs, since the guard covers the gutter), 'shingle' (shingle tabs) or 'magnet' (metal roofs). Older lines = gutter.
const MOUNTS = [['gutter', 'Gutter', 'flex clips'], ['guard', 'Gutter guard', 'shingle tabs (guard covers the gutter)'], ['shingle', 'Shingle', 'shingle tabs'], ['magnet', 'Magnet', 'magnet clips (metal roof)']];
const normalize = (l) => ({ feet: l.feet, level: l.level, mount: l.mount || 'gutter', pts: ptsOf(l), ...(l.color ? { color: l.color } : {}), ...(l.clip ? { clip: l.clip } : {}) });

// Plan colors (Mark up step): wire color of each roof line and each zip (jump) line — white or black.
const ZIP_COLORS = [['white', 'White', '#FFFFFF'], ['black', 'Black', '#111111'], ['green', 'Green', '#1F7A35']];
const zipHex = (k) => ZIP_COLORS.find((c) => c[0] === k)?.[2] || '#FFFFFF';
function Swatch({ hex, on, label, onClick }) {
  return (
    <button onClick={onClick} title={label} className={`inline-flex items-center gap-1.5 px-2 h-8 rounded-md text-xs font-bold border cursor-pointer ${on ? 'border-white text-white bg-white/10' : 'border-[#404040] text-neutral-300 hover:text-white'}`}>
      <span className="w-4 h-4 rounded-full border border-white/40" style={{ background: hex }} />
      {label}
    </button>
  );
}
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

// Feet tag: text, size, and a spot that doesn't overlap other tags.
const tagFs = (w, h, scale = 1) => Math.max(14, Math.round(Math.max(w, h) / 55)) * scale;
const tagText = (l, editing, jump) => `${l.feet ? `${l.feet} ft` : '? ft'}${editing && !jump ? (l.mount === 'shingle' ? ' · tab' : l.mount === 'magnet' ? ' · mag' : l.mount === 'guard' ? ' · guard' : '') : ''}`;
const tagW = (text, fs) => text.length * fs * 0.6 + fs * 0.6;
// items: [{ mx, my, tw }] (anchor on the line + tag width) → [{ x, y }] tag centers.
// Each tag takes the nearest open spot: above its line, then below, then shifted sideways, then farther out.
function layoutTags(items, fs, W, H) {
  const hgt = fs * 1.4;
  const pad = fs * 0.3;
  const placed = [];
  const out = [];
  const hit = (x, y, tw) => placed.some((r) => Math.abs(r.x - x) < (r.tw + tw) / 2 + pad && Math.abs(r.y - y) < hgt + pad);
  const order = items.map((_, i) => i).sort((a, b) => items[a].my - items[b].my || items[a].mx - items[b].mx);
  for (const i of order) {
    const { mx, my, tw } = items[i];
    const clamp = (x, y) => [Math.min(W - tw / 2, Math.max(tw / 2, x)), Math.min(H - hgt / 2, Math.max(hgt / 2, y))];
    const spots = [];
    for (const k of [1.3, 2.9, 4.5, 6.1]) for (const dx of [0, -0.6, 0.6, -1.2, 1.2]) for (const dir of [-1, 1]) spots.push(clamp(mx + dx * tw, my + dir * k * fs));
    const [x, y] = spots.find(([sx, sy]) => !hit(sx, sy, tw)) || spots[0];
    placed.push({ x, y, tw });
    out[i] = { x, y };
  }
  return out;
}
// Tag spots for lights lines + zip lines together, so neither covers the other.
function layoutAll(lines, jumps, w, h, editing) {
  const fs = tagFs(w, h);
  const items = [...lines.map((l) => [l, false]), ...jumps.map((l) => [l, true])].map(([l, jump]) => { const a = labelAt(ptsOf(l)); return { mx: a.x, my: a.y, tw: tagW(tagText(l, editing, jump), fs) }; });
  const all = layoutTags(items, fs, w, h);
  return [all.slice(0, lines.length), all.slice(lines.length)];
}

export function LinesOverlay({ lines, w, h, selected = -1, onSelect, onHandle, scale = 1, ppx = 1, bare = false, jump = false, plan = false, tagAt = null }) {
  // ppx = photo pixels per screen pixel, so handles are the same size on screen for any photo
  const u = ppx;
  const sw = Math.max(2, Math.round(Math.max(w, h) / 450)) * scale * (plan || jump ? 1.35 : 1); // a hair thicker in Mark up so black shows
  const fs = tagFs(w, h, scale);
  // Tag spots: given by the editor (so lights + zip tags dodge each other), or worked out here.
  const anchors = lines.map((l) => { const a = labelAt(ptsOf(l)); return { mx: a.x, my: a.y, tw: tagW(tagText(l, !!onSelect, jump), fs) }; });
  const spots = bare ? [] : tagAt || layoutTags(anchors, fs, w, h);
  return (
    <>
      {lines.map((l, i) => {
        const pts = ptsOf(l);
        // Mark up (plan) and jumps = wire color; Line details = Easy/Medium/Hard. Nothing picked = white.
        const c = jump || plan ? zipHex(l.color) : LEVEL_COLOR[l.level] || '#ffffff';
        const dark = c === '#111111';
        const on = i === selected;
        return (
          <g key={i}>
            <g onPointerDown={onSelect ? (e) => { e.stopPropagation(); onSelect(i); } : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }}>
              {onSelect && <polyline points={ptStr(pts)} fill="none" stroke="transparent" strokeWidth={Math.max(sw * 5, 18 * u)} />}
              {on && <polyline points={ptStr(pts)} fill="none" stroke="#B0FF03" strokeOpacity="0.55" strokeWidth={sw * 5} strokeLinecap="round" strokeLinejoin="round" />}
              <polyline points={ptStr(pts)} fill="none" stroke={dark ? '#fff' : '#000'} strokeOpacity={dark ? 0.8 : 0.45} strokeWidth={dark ? sw * 2.4 : sw * 2} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={ptStr(pts)} fill="none" stroke={c} strokeWidth={jump ? sw * 1.3 : on ? sw * 1.6 : sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={jump ? `0.01 ${sw * 2.3}` : undefined} />
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
            {/* Hollow dot mid-side: drag it to add a bend point there */}
            {on && onHandle && pts.slice(1).map((p, j) => {
              const mx = (pts[j].x + p.x) / 2;
              const my = (pts[j].y + p.y) / 2;
              return (
                <g key={`m${j}`} onPointerDown={(e) => { e.stopPropagation(); onHandle(e, i, j, 'insert'); }} style={{ cursor: 'copy' }}>
                  <circle cx={mx} cy={my} r={12 * u} fill="transparent" />
                  <circle cx={mx} cy={my} r={4.5 * u} fill="rgba(0,0,0,0.35)" stroke="#fff" strokeWidth={2 * u}>
                    <title>Drag to add a bend here</title>
                  </circle>
                </g>
              );
            })}
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
      {/* Feet tags on top of every line, each joined to a dot on its own line. */}
      {!bare && lines.map((l, i) => {
        const sp = spots[i];
        if (!sp) return null;
        const { mx, my, tw } = anchors[i];
        const c = jump || plan ? zipHex(l.color) : LEVEL_COLOR[l.level] || '#ffffff';
        const dark = c === '#111111';
        const on = i === selected;
        const hgt = fs * 1.4;
        const ey = sp.y < my ? sp.y + hgt / 2 : sp.y - hgt / 2; // tag edge nearest the line
        const ex = Math.min(sp.x + tw / 2 - fs * 0.4, Math.max(sp.x - tw / 2 + fs * 0.4, mx));
        return (
          <g key={`t${i}`} onPointerDown={onSelect ? (e) => { e.stopPropagation(); onSelect(i); } : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <line x1={ex} y1={ey} x2={mx} y2={my} stroke={dark ? '#fff' : '#000'} strokeOpacity="0.6" strokeWidth={sw * 1.6} />
            <line x1={ex} y1={ey} x2={mx} y2={my} stroke={c} strokeWidth={sw * 0.8} />
            <circle cx={mx} cy={my} r={sw * 1.4} fill={c} stroke={dark ? '#fff' : '#000'} strokeWidth={sw * 0.5} />
            <rect x={sp.x - tw / 2} y={sp.y - hgt / 2} width={tw} height={hgt} rx={fs * 0.35} fill={c} stroke={on ? '#B0FF03' : dark ? '#fff' : '#000'} strokeOpacity={on ? 1 : 0.35} strokeWidth={on ? sw : sw / 2} />
            <text x={sp.x} y={sp.y + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight="700" fontFamily="Arial, sans-serif" fill={dark ? '#fff' : '#000'}>{tagText(l, !!onSelect, jump)}</text>
          </g>
        );
      })}
    </>
  );
}

// mode 'draw' = only draw/move lines. mode 'measure' (Line details) = tap a line: feet, Easy/Medium/Hard, gutter/shingle/magnet.
// Lights lines + zip lines together (photo cards), feet tags laid out so they don't overlap.
export function PlanOverlay({ lines = [], jumps = [], w, h, tags = false, plan = true }) {
  const [tl, tj] = tags ? layoutAll(lines, jumps, w, h, false) : [null, null];
  return (
    <>
      <LinesOverlay lines={lines} w={w} h={h} bare={!tags} plan={plan} tagAt={tl} />
      <LinesOverlay jump lines={jumps} w={w} h={h} bare={!tags} tagAt={tj} />
    </>
  );
}

// Jump lines: plain cord between sections — white dashed.
export function JumpLines({ jumps = [], w, h, onTap }) {
  const sw = Math.max(2, Math.round(Math.max(w, h) / 450)) * 1.35;
  return jumps.map((j, i) => {
    const pts = j.pts.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <g key={`j${i}`} onPointerDown={onTap ? (e) => { e.stopPropagation(); onTap(i); } : undefined} style={{ cursor: onTap ? 'pointer' : undefined }}>
        {onTap && <polyline points={pts} fill="none" stroke="transparent" strokeWidth={sw * 8} />}
        <polyline points={pts} fill="none" stroke={j.color === 'black' ? '#fff' : '#000'} strokeOpacity={j.color === 'black' ? 0.8 : 0.45} strokeWidth={j.color === 'black' ? sw * 2.4 : sw * 2} strokeLinecap="round" />
        <polyline points={pts} fill="none" stroke={zipHex(j.color)} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`0.01 ${sw * 2.3}`} />
        <title>Jump line{onTap ? ' — tap to remove' : ''}</title>
      </g>
    );
  });
}

// Plug markers for where the power is (drawn over a photo; w/h = photo size).
// inline = where power feeds into the middle of a run (orange ⚡), else the outlet (yellow 🔌).
export function OutletMarks({ outlets = [], w, h, onDown, inline = false }) {
  const r = Math.max(16, Math.max(w, h) / 45);
  return outlets.map((p, i) => (
    <g key={`ol${i}`} onPointerDown={onDown ? (e) => { e.stopPropagation(); onDown(e, i); } : undefined} style={{ cursor: onDown ? 'grab' : 'default' }}>
      <circle cx={p.x} cy={p.y} r={inline ? r * 0.85 : r} fill={inline ? '#FF9500' : '#FACC15'} stroke="#000" strokeWidth={r / 6} />
      <text x={p.x} y={p.y} fontSize={r * (inline ? 0.95 : 1.15)} textAnchor="middle" dominantBaseline="central">{inline ? '⚡' : '🔌'}</text>
      <title>{inline ? 'Inline power' : 'Power'}{onDown ? ' — drag to move' : ''}</title>
    </g>
  ));
}

// Backup of the editor's unsaved work (per photo), so a page reload / reset mid-edit never loses lines.
// Keyed by section too — a duplicated section has the same photo.
const draftKey = (photo, id = '') => `lights-editor-draft:${id}:${(photo || '').length}:${(photo || '').slice(-40)}`;
function readDraft(photo, id) {
  try { return JSON.parse(localStorage.getItem(draftKey(photo, id)) || 'null'); } catch { return null; }
}

export default function LightsMarkup({ photo, initialLines = [], initialScale = 0, initialPeaks = [], initialOutlets = [], initialInlines = [], initialJumps = [], onSave, onClose, mode = 'all', nav = null, draftId = '' }) {
  // draw = Mark up (plan: lights, jumps, power, peaks, mount, wire) · measure = feet only · rate = Easy/Medium/Hard
  const drawing = mode === 'draw' || mode === 'all';
  const measuring = mode !== 'draw';
  const feetUI = mode === 'measure' || mode === 'all';
  const rateUI = mode === 'rate' || mode === 'all';
  const [size, setSize] = useState(null); // natural image size
  // What's saved on the quote right now — the backup only matters when the work differs from it.
  const savedSig = JSON.stringify({ lines: initialLines.map(normalize), jumps: initialJumps || [], outlets: initialOutlets || [], inlines: initialInlines || [], peaks: initialPeaks || [], scale: initialScale || 0 });
  const [backup] = useState(() => { const d = readDraft(photo, draftId); return d && JSON.stringify({ lines: (d.lines || []).map(normalize), jumps: d.jumps || [], outlets: d.outlets || [], inlines: d.inlines || [], peaks: d.peaks || [], scale: d.scale || 0 }) !== savedSig ? d : null; }); // unsaved work from before a reload
  const restored = !!backup;
  const [lines, setLines] = useState(() => (backup?.lines || initialLines).map(normalize));
  const [history, setHistory] = useState([]); // earlier { lines, jumps, outlets, peaks }, for Undo / ⌘Z
  const [draft, setDraft] = useState(null); // new line being dragged: { a, b }
  const [grab, setGrab] = useState(null); // dragging a dot: { i, j }
  const [sel, setSel] = useState(-1);
  // Peaks: tap a peak to drop a marker = 1 O clip there.
  const [peaks, setPeaks] = useState(() => backup?.peaks || initialPeaks || []);
  const [peakMode, setPeakMode] = useState(false);
  // Power: tap where the outlet is — shows a plug marker.
  const [outlets, setOutlets] = useState(() => backup?.outlets || initialOutlets || []);
  const [outletMode, setOutletMode] = useState(false);
  const [dragPlug, setDragPlug] = useState(null); // { i, moved, inline } while dragging a plug
  // Inlines: where power feeds into the middle of a run.
  const [inlines, setInlines] = useState(() => backup?.inlines || initialInlines || []);
  const [inlineMode, setInlineMode] = useState(false);
  // Jump lines: plain cord between sections (no bulbs) — white dashed, not counted in feet.
  const [jumps, setJumps] = useState(() => backup?.jumps || initialJumps || []);
  const [jumpMode, setJumpMode] = useState(false);
  const [selJump, setSelJump] = useState(-1);
  const [roofMode, setRoofMode] = useState(false); // Mark up: drags only draw a roof line while this tool is on
  const [newColor, setNewColor] = useState(() => localStorage.getItem('lights-markup-color') || 'white');
  const [newZip, setNewZip] = useState(() => localStorage.getItem('lights-markup-zip') || 'white');
  const [pitchOpen, setPitchOpen] = useState(false);
  // Scale = photo pixels per foot, from a line drawn over something of known size.
  const [scale, setScale] = useState(() => backup?.scale ?? initialScale);
  const [showRestored, setShowRestored] = useState(restored);
  // Keep the backup current on every change; Done / Cancel clear it.
  useEffect(() => {
    const cur = { lines, jumps, outlets, inlines, peaks, scale: scale || 0 };
    try {
      if (JSON.stringify(cur) === savedSig) localStorage.removeItem(draftKey(photo, draftId));
      else localStorage.setItem(draftKey(photo, draftId), JSON.stringify(cur));
    } catch { /* storage full — skip */ }
  }, [photo, draftId, lines, jumps, outlets, inlines, peaks, scale, savedSig]);
  const clearDraft = () => { try { localStorage.removeItem(draftKey(photo, draftId)); } catch { /* ignore */ } };
  // ‹ › / ← →: save this section and go to the next or previous one.
  const goSection = (dir) => { if (!nav) return; clearDraft(); nav.go(dir, [lines, size, scale, peaks, outlets, jumps, inlines]); };
  const [scaleMode, setScaleMode] = useState(false); // next drag draws the ruler
  const [ruler, setRuler] = useState(null); // { a, b } waiting for its real length
  const [rulerFt, setRulerFt] = useState('');
  const [across, setAcross] = useState('');
  const [pitch, setPitch] = useState(6);
  const [level, setLevel] = useState(() => localStorage.getItem('lights-markup-level') || 'easy');
  const [mount, setMount] = useState(() => localStorage.getItem('lights-markup-mount') || 'gutter');
  const svgRef = useRef(null);
  const [ppx, setPpx] = useState(1);
  const feetRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.width, h: img.height });
    img.src = photo;
  }, [photo]);

  useEffect(() => { localStorage.setItem('lights-markup-level', level); }, [level]);
  useEffect(() => { localStorage.setItem('lights-markup-color', newColor); localStorage.setItem('lights-markup-zip', newZip); }, [newColor, newZip]);
  useEffect(() => { localStorage.setItem('lights-markup-mount', mount); }, [mount]);
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
    if (sel < 0 || !feetUI) return;
    const zoomed = (window.visualViewport?.scale || 1) > 1.01;
    if (!zoomed) feetRef.current?.focus({ preventScroll: true });
  }, [sel, feetUI]);

  const pt = (e) => {
    const svg = svgRef.current;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(0, Math.min(size.w, q.x)), y: Math.max(0, Math.min(size.h, q.y)) };
  };

  const snap = () => setHistory((h) => [...h, { lines, jumps, outlets, inlines, peaks }]);
  const commit = (next) => { snap(); setLines(next); };
  const minLen = () => Math.max(size.w, size.h) / 60;

  const down = (e) => {
    if (!size) return;
    if (peakMode) { snap(); setPeaks((ps) => [...ps, pt(e)]); return; }
    if (outletMode) { snap(); setOutlets((os) => [...os, pt(e)]); return; }
    if (inlineMode) { snap(); setInlines((os) => [...os, pt(e)]); return; }
    if (jumpMode) { svgRef.current.setPointerCapture(e.pointerId); const p0 = pt(e); setSel(-1); setSelJump(-1); setDraft({ a: p0, b: p0 }); return; }
    // No tool on (or Line details): tapping the photo just deselects.
    if ((!drawing || (!measuring && !roofMode)) && !scaleMode) { setSel(-1); setSelJump(-1); return; }
    svgRef.current.setPointerCapture(e.pointerId);
    const p = pt(e);
    setSel(-1); setSelJump(-1);
    setDraft({ a: p, b: p });
  };

  // Handles on the selected line: a dot moves that point; the + past an end
  // adds a new corner and keeps the line going.
  const onHandle = (e, i, j, mode) => {
    svgRef.current.setPointerCapture(e.pointerId);
    const pts = lines[i].pts;
    if (mode === 'insert') {
      // Hollow dot in the middle of a side: add a bend point there and drag it.
      const mid = { x: (pts[j].x + pts[j + 1].x) / 2, y: (pts[j].y + pts[j + 1].y) / 2 };
      commit(lines.map((l, k) => (k === i ? { ...l, pts: [...pts.slice(0, j + 1), mid, ...pts.slice(j + 1)] } : l)));
      setGrab({ i, j: j + 1 });
    } else if (mode === 'extend') {
      const p = { ...pts[j] };
      const nextPts = j === 0 ? [p, ...pts] : [...pts, p];
      commit(lines.map((l, k) => (k === i ? { ...l, pts: nextPts } : l)));
      setGrab({ i, j: j === 0 ? 0 : nextPts.length - 1, extend: true });
    } else {
      commit(lines);
      setGrab({ i, j });
    }
  };

  // Same dots / + handles as roof lines, but on the jump lines.
  const onJumpHandle = (e, i, j, mode) => {
    svgRef.current.setPointerCapture(e.pointerId);
    snap();
    const pts = jumps[i].pts;
    if (mode === 'insert') {
      const mid = { x: (pts[j].x + pts[j + 1].x) / 2, y: (pts[j].y + pts[j + 1].y) / 2 };
      setJumps((js) => js.map((l, k) => (k === i ? { ...l, pts: [...pts.slice(0, j + 1), mid, ...pts.slice(j + 1)] } : l)));
      setGrab({ i, j: j + 1, jump: true });
    } else if (mode === 'extend') {
      const p = { ...pts[j] };
      const nextPts = j === 0 ? [p, ...pts] : [...pts, p];
      setJumps((js) => js.map((l, k) => (k === i ? { ...l, pts: nextPts } : l)));
      setGrab({ i, j: j === 0 ? 0 : nextPts.length - 1, extend: true, jump: true });
    } else {
      setGrab({ i, j, jump: true });
    }
  };

  const move = (e) => {
    if (!size) return;
    if (dragPlug) {
      const p = pt(e);
      (dragPlug.inline ? setInlines : setOutlets)((os) => os.map((o, k) => (k === dragPlug.i ? p : o)));
      if (!dragPlug.moved) { snap(); setDragPlug((d) => ({ ...d, moved: true })); }
      return;
    }
    if (grab?.jump) {
      const p = pt(e);
      setJumps((ls) => ls.map((l, k) => (k === grab.i ? { ...l, pts: l.pts.map((q, m) => (m === grab.j ? p : q)) } : l)));
    } else if (grab) {
      const p = pt(e);
      setLines((ls) => ls.map((l, k) => (k === grab.i ? { ...l, pts: l.pts.map((q, m) => (m === grab.j ? p : q)) } : l)));
    } else if (draft) {
      const p = pt(e);
      setDraft((d) => ({ ...d, b: p }));
    }
  };

  const up = (e) => {
    if (dragPlug) {
      // A tap (no drag) in Power mode removes the plug.
      if (!dragPlug.moved && (dragPlug.inline ? inlineMode : outletMode)) { snap(); (dragPlug.inline ? setInlines : setOutlets)((os) => os.filter((_, k) => k !== dragPlug.i)); }
      setDragPlug(null);
      return;
    }
    if (grab?.jump) {
      if (grab.extend) {
        const l = jumps[grab.i];
        const nb = grab.j === 0 ? l.pts[1] : l.pts[l.pts.length - 2];
        const p = l.pts[grab.j];
        if (Math.hypot(p.x - nb.x, p.y - nb.y) < minLen()) setJumps((ls) => ls.map((x, k) => (k === grab.i ? { ...x, pts: x.pts.filter((_, m) => m !== grab.j) } : x)));
      }
      setGrab(null);
      return;
    }
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
    // Use where the finger/mouse let go (a quick drag can end before the last move registers).
    const dr = { a: draft.a, b: e && size ? pt(e) : draft.b };
    if (jumpMode) {
      if (Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y) > minLen()) { snap(); setJumps((js) => [...js, { pts: [dr.a, dr.b], color: newZip }]); setSelJump(jumps.length); }
      setDraft(null);
      return;
    }
    if (scaleMode) {
      if (Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y) > minLen()) setRuler(dr);
      setScaleMode(false);
      setDraft(null);
      return;
    }
    if (Math.hypot(dr.b.x - dr.a.x, dr.b.y - dr.a.y) > minLen()) {
      commit([...lines, { pts: [dr.a, dr.b], feet: '', level: measuring ? level : '', mount, ...(!measuring && newColor ? { color: newColor } : {}) }]);
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
  const estimateAll = () => { setLines((ls) => ls.map((l) => (Number(l.feet) > 0 ? l : { ...l, feet: String(estimate(l)) }))); setJumps((js) => js.map((l) => (Number(l.feet) > 0 ? l : { ...l, feet: String(estimate(l)) }))); };
  const remove = () => { commit(lines.filter((_, i) => i !== sel)); setSel(-1); };
  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setLines(last.lines); setJumps(last.jumps); setOutlets(last.outlets); setInlines(last.inlines || []); setPeaks(last.peaks);
    setHistory((h) => h.slice(0, -1));
    setSel(-1); setSelJump(-1);
  };

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
      if (e.key === 'Escape') { setSel(-1); setSelJump(-1); }
      if (!typing && nav && !dragPlug && !grab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); goSection(e.key === 'ArrowLeft' ? -1 : 1); return; }
      // Delete key removes a line only while drawing the plan — on Measure/Difficulty a stray Backspace (fixing feet) wiped whole lines.
      if ((e.key === 'Backspace' || e.key === 'Delete') && drawing && sel >= 0 && !typing && document.activeElement !== feetRef.current) remove();
      if ((e.key === 'Backspace' || e.key === 'Delete') && drawing && selJump >= 0 && !typing) { snap(); setJumps((js) => js.filter((_, k) => k !== selJump)); setSelJump(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const totals = { easy: 0, medium: 0, hard: 0 };
  lines.forEach((l) => { if (l.level in totals) totals[l.level] += ftOf(l); });
  const cur = sel >= 0 ? lines[sel] : null;
  const missing = lines.filter((l) => !ftOf(l)).length;

  // Lights + zip feet tags laid out together so they never pile on each other.
  const [tagLines, tagJumps] = size && feetUI ? layoutAll(lines, feetUI ? jumps : [], size.w, size.h, true) : [null, null];

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#141414] border-b border-[#2e2e2e]">
        {rateUI && <span className="text-sm text-neutral-400 mr-1">Rate</span>}
        {rateUI && LEVELS.map((l) => (
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
        {!measuring && <button onClick={() => { setRoofMode((m) => !m); setJumpMode(false); setOutletMode(false); setInlineMode(false); setPeakMode(false); setSelJump(-1); }}
          className={`ml-3 px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer ${roofMode ? 'bg-[#B0FF03] text-black border-[#B0FF03]' : 'text-neutral-300 border-[#2e2e2e] hover:text-white'}`}
          title="Drag to draw a lights line">
          ╱ Lights{lines.length ? ` (${lines.length})` : ''}
        </button>}
        {!measuring && <button onClick={() => { setJumpMode((m) => !m); setRoofMode(false); setOutletMode(false); setInlineMode(false); setPeakMode(false); setSel(-1); }}
          className={`ml-3 px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer ${jumpMode ? 'bg-white text-black border-white' : 'text-neutral-300 border-[#2e2e2e] hover:text-white'}`}
          title="Drag to draw a jump line — plain cord between sections, no lights">
          ┄ Jump{jumps.length ? ` (${jumps.length})` : ''}
        </button>}
        {!measuring && <button onClick={() => { setOutletMode((m) => !m); setInlineMode(false); setRoofMode(false); setJumpMode(false); setPeakMode(false); }}
          className={`ml-3 px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer ${outletMode ? 'bg-yellow-400 text-black border-yellow-400' : outlets.length ? 'text-neutral-300 border-[#2e2e2e] hover:text-white' : 'text-yellow-300 border-yellow-400 animate-pulse'}`}
          title="Tap where the outlet is">
          🔌 Power{outlets.length ? ` (${outlets.length})` : ''}
        </button>}
        {!measuring && <button onClick={() => { setInlineMode((m) => !m); setOutletMode(false); setRoofMode(false); setJumpMode(false); setPeakMode(false); }}
          className={`ml-3 px-3 py-1.5 rounded-lg text-sm font-semibold border cursor-pointer ${inlineMode ? 'bg-[#FF9500] text-black border-[#FF9500]' : 'text-neutral-300 border-[#2e2e2e] hover:text-white'}`}
          title="Tap where power feeds into the middle of a run">
          ⚡ Inline{inlines.length ? ` (${inlines.length})` : ''}
        </button>}
        {/* Peaks tool removed — bulbs snap to corners on their own. */}
        {feetUI && <button
          onClick={() => { setScaleMode((m) => !m); setSel(-1); }}
          className={`ml-3 inline-flex items-center gap-1 text-sm cursor-pointer ${scaleMode ? 'text-[#B0FF03]' : scale ? 'text-neutral-300 hover:text-white' : 'text-yellow-400 hover:text-yellow-300'}`}
          title="Drag across something you know the size of (like a garage door) so Hub can estimate feet"
        >
          <Ruler size={15} /> {scaleMode ? 'Drag across a garage door…' : scale ? 'Scale set' : 'Set scale'}
        </button>}
        {feetUI && scale > 0 && [...lines, ...jumps].some((l) => !(Number(l.feet) > 0)) && (
          <button onClick={estimateAll} className="ml-2 inline-flex items-center gap-1 text-sm text-neutral-300 hover:text-white cursor-pointer"><Wand2 size={15} /> Estimate all</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {nav && nav.total > 1 && (
            <div className="flex items-center gap-1 mr-2">
              <button onClick={() => goSection(-1)} disabled={nav.at <= 0} title="Previous section (←)" className="w-10 h-9 rounded-lg border border-[#404040] text-white text-xl font-bold disabled:opacity-25 hover:bg-white/10 cursor-pointer">‹</button>
              <span className="px-2 text-sm font-semibold text-white whitespace-nowrap">Section {nav.at + 1} of {nav.total}</span>
              <button onClick={() => goSection(1)} disabled={nav.at >= nav.total - 1} title="Next section (→)" className="w-10 h-9 rounded-lg border border-[#404040] text-white text-xl font-bold disabled:opacity-25 hover:bg-white/10 cursor-pointer">›</button>
            </div>
          )}
          {showRestored && (
            <span className="text-xs font-semibold text-yellow-300">
              Restored your unsaved changes ·{' '}
              <button onClick={() => { setLines(initialLines.map(normalize)); setJumps(initialJumps || []); setOutlets(initialOutlets || []); setInlines(initialInlines || []); setPeaks(initialPeaks || []); setScale(initialScale); setShowRestored(false); }} className="underline cursor-pointer">discard them</button>
            </span>
          )}
          <button onClick={() => { clearDraft(); onClose(); }} className="px-3 py-1.5 rounded-lg text-sm text-neutral-300 hover:text-white cursor-pointer"><X size={15} className="inline -mt-0.5" /> Cancel</button>
          <button onClick={() => { clearDraft(); onSave(lines, size, scale, peaks, outlets, jumps, inlines); }} className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#B0FF03] text-black cursor-pointer"><Check size={15} className="inline -mt-0.5" /> Done</button>
        </div>
      </div>

      {/* Selected line / tool bar — under the tools */}
      <div className="flex items-center gap-4 px-4 py-3 bg-[#141414] border-b border-[#2e2e2e] text-sm">
        {scaleMode ? (
          <span className="text-yellow-300 font-semibold text-base">📏 Set the scale first: drag across something you know the length of — like the garage door (single 8–9 ft, double 16 ft). Then type its length.</span>
        ) : cur ? (
          <div className={measuring ? 'flex items-center gap-2' : 'flex flex-col items-start gap-2'} onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-neutral-400">This line:</span>
            {feetUI && <>
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
            </>}
            {rateUI && LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => { edit({ level: l.key }); setLevel(l.key); }}
                className="px-2.5 h-8 rounded-md text-xs font-bold text-black cursor-pointer"
                style={{ background: LEVEL_COLOR[l.key], outline: cur.level === l.key ? '2px solid #fff' : 'none', outlineOffset: 2 }}
              >
                {l.label}
              </button>
            ))}
            {/* Plan options stacked: one row each for On / Wire / Clips */}
            {!measuring && <div className="flex items-center gap-2 flex-wrap"><span className="w-12 text-neutral-400">On:</span>
            {MOUNTS.map(([k, label, tip]) => (
              <button key={k} title={`Uses ${tip}`} onClick={() => { snap(); edit({ mount: k }); setMount(k); }}
                className={`px-2.5 h-8 rounded-md text-xs font-bold border cursor-pointer ${(cur.mount || 'gutter') === k ? 'bg-white text-black border-white' : 'border-[#404040] text-neutral-300'}`}>
                {label}
              </button>
            ))}</div>}
            {feetUI && <button
              onClick={() => setPitchOpen((o) => !o)}
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-md text-xs font-bold border cursor-pointer ${pitchOpen ? 'border-[#B0FF03] text-[#B0FF03]' : 'border-[#404040] text-neutral-300 hover:text-white'}`}
              title="Work out a sloped length from the pitch"
            >
              <Triangle size={13} /> Pitch
            </button>}
            {!measuring && <div className="flex items-center gap-2 flex-wrap"><span className="w-12 text-neutral-400">Wire:</span>
            {ZIP_COLORS.map(([k, label, hex]) => (
              <Swatch key={k} hex={hex} label={label} on={(cur.color || 'white') === k} onClick={() => { snap(); edit({ color: k }); setNewColor(k); }} />
            ))}</div>}
            {/* Clips: gutter lines only — white by default, black for black gutters. Shingle tabs are always black. */}
            {!measuring && (cur.mount || 'gutter') === 'gutter' && <div className="flex items-center gap-2 flex-wrap"><span className="w-12 text-neutral-400">Clips:</span>
            {ZIP_COLORS.filter(([k]) => k !== 'green').map(([k, label, hex]) => (
              <Swatch key={`c${k}`} hex={hex} label={label} on={(cur.clip === 'black' ? 'black' : 'white') === k} onClick={() => { snap(); edit({ clip: k }); }} />
            ))}</div>}
            <div className="flex items-center gap-2">
              {drawing && <button onClick={remove} className="p-1.5 text-neutral-400 hover:text-red-500 cursor-pointer" title="Delete line"><Trash2 size={16} /></button>}
              <button onClick={() => { setSel(-1); setPitchOpen(false); }} className="px-3 h-8 rounded-md bg-[#B0FF03] text-black text-xs font-bold cursor-pointer">OK</button>
            </div>
          </div>
        ) : (
          feetUI && selJump >= 0 && jumps[selJump]
            ? <span className="text-white flex items-center gap-2 flex-wrap" onPointerDown={(e) => e.stopPropagation()}>
                <span className="text-neutral-400">This zip line:</span>
                <input autoFocus value={jumps[selJump].feet || ''} inputMode="decimal" placeholder="ft"
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setJumps((js) => js.map((x, i) => (i === selJump ? { ...x, feet: v } : x))); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelJump(-1); }}
                  className="w-20 rounded-md border border-[#404040] bg-black px-2 py-1 text-white text-base font-bold text-center outline-none focus:border-[#B0FF03] select-text" />
                <span className="text-neutral-400">ft</span>
                <button onClick={() => (scale ? setJumps((js) => js.map((x, i) => (i === selJump ? { ...x, feet: String(estimate(x)) } : x))) : setScaleMode(true))}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md text-xs font-bold border border-[#404040] text-neutral-300 hover:text-white cursor-pointer">
                  <Wand2 size={13} /> {scale ? `Estimate ≈ ${estimate(jumps[selJump])}` : 'Estimate'}
                </button>
                <button onClick={() => setSelJump(-1)} className="px-3 h-8 rounded-md bg-[#B0FF03] text-black text-xs font-bold cursor-pointer">OK</button>
              </span>
            : jumpMode || (selJump >= 0 && jumps[selJump])
            ? (selJump >= 0 && jumps[selJump]
              ? <span className="text-white flex items-center gap-3 flex-wrap" onPointerDown={(e) => e.stopPropagation()}>Zip:
                  {ZIP_COLORS.map(([k, label, hex]) => <Swatch key={k} hex={hex} label={label} on={(jumps[selJump].color || 'white') === k} onClick={() => { snap(); setJumps((js) => js.map((x, i) => (i === selJump ? { ...x, color: k } : x))); setNewZip(k); }} />)}
                  <span className="text-neutral-400">Drag a <b className="text-white">dot</b> to move, a <b className="text-white">hollow dot</b> to bend, the <b className="text-white">+</b> to add on.</span>
                  <button onClick={() => { snap(); setJumps((js) => js.filter((_, k) => k !== selJump)); setSelJump(-1); }} className="inline-flex items-center gap-1 text-neutral-300 hover:text-red-500 cursor-pointer"><Trash2 size={15} /> Delete jump</button>
                  <button onClick={() => setSelJump(-1)} className="px-3 h-8 rounded-md bg-[#B0FF03] text-black text-xs font-bold cursor-pointer">OK</button></span>
              : <span className="text-white">Drag to draw a <b>jump line</b> — plain cord, no lights (not counted in feet). Tap one to bend it or add on.</span>)
            : inlineMode
            ? <span className="text-[#FF9500]">Tap where power feeds <b>into the middle of a run</b>. Drag to move, tap to remove.</span>
            : outletMode
            ? <span className="text-yellow-400">Tap where the <b>outlet</b> is. Drag a plug to move it, tap it to remove.</span>
            : drawing && !measuring && !roofMode
            ? <span className="text-neutral-400">Pick a tool up top — <b className="text-white">╱ Lights</b>, <b className="text-white">┄ Jump</b>, <b className="text-white">🔌 Power</b> or <b className="text-white">⚡ Inline</b> — to draw. Tap any line to edit it.{!outlets.length && <b className="text-yellow-300"> Don't forget: mark where the outlet is.</b>}</span>
            : drawing
            ? <span className="text-neutral-400">Drag to draw a lights line. Tap a line: drag a <b className="text-white">dot</b> to move it, drag a <b className="text-white">hollow dot</b> mid-line to add a bend, or the <b className="text-white">+</b> at an end to keep going.{!outlets.length && <b className="text-yellow-300"> Don't forget: tap 🔌 Power and mark where the outlet is.</b>}</span>
            : peakMode
            ? <span className="text-[#E8C36A]">Tap each <b>peak</b> to add an O clip. Tap a marker to remove it. {peaks.length} peak{peaks.length === 1 ? '' : 's'}.</span>
            : rateUI && !feetUI
            ? <span className="text-neutral-400">Tap a line and rate it <b className="text-white">Easy / Medium / Hard</b>.</span>
            : <span className="text-neutral-400">Tap a line (lights or zip) and type its <b className="text-white">feet</b> — or set a scale and hit <b className="text-white">Estimate</b>.</span>
        )}
        {!measuring && <span className="ml-auto text-neutral-300 font-semibold">{lines.length} line{lines.length === 1 ? '' : 's'}</span>}
        {feetUI && <>
        <span className="ml-auto font-semibold text-white">{lines.reduce((t, l) => t + ftOf(l), 0)} ft lights</span>
        {jumps.length > 0 && <span className="font-semibold text-neutral-300">· {jumps.reduce((t, l) => t + ftOf(l), 0)} ft zip</span>}
        {missing > 0 && <span className="text-yellow-400">{missing} line{missing > 1 ? 's' : ''} need feet</span>}
        </>}
        {rateUI && <>
        {LEVELS.map((lv, k) => <span key={lv.key} className={`${k === 0 && !feetUI ? 'ml-auto ' : ''}font-semibold`} style={{ color: LEVEL_COLOR[lv.key] }}>{lines.filter((l) => l.level === lv.key).length} {lv.label}</span>)}
        {lines.some((l) => !LEVEL_COLOR[l.level]) && <span className="text-white/80">{lines.filter((l) => !LEVEL_COLOR[l.level]).length} not rated</span>}
        </>}
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
              style={{ cursor: drawing || scaleMode ? 'crosshair' : 'default' }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
            >
              <LinesOverlay lines={lines} w={size.w} h={size.h} selected={sel} onSelect={peakMode || outletMode || inlineMode || jumpMode ? undefined : (i) => { setSelJump(-1); setSel(i); if (!measuring) { setRoofMode(true); setJumpMode(false); } }} onHandle={drawing && !peakMode && !outletMode && !inlineMode ? onHandle : undefined} ppx={ppx} bare={!feetUI} plan={!rateUI} tagAt={tagLines} />
              {!rateUI && peaks.map((p, i) => {
                const r = Math.max(14, Math.max(size.w, size.h) / 55);
                return (
                  <g key={`pk${i}`} onPointerDown={(e) => { e.stopPropagation(); if (peakMode) setPeaks((ps) => ps.filter((_, k) => k !== i)); }} style={{ cursor: peakMode ? 'pointer' : 'default' }}>
                    <polygon points={`${p.x},${p.y - r} ${p.x - r * 0.9},${p.y + r * 0.7} ${p.x + r * 0.9},${p.y + r * 0.7}`} fill="#E8C36A" stroke="#000" strokeWidth={r / 5} />
                    <title>O clip at this peak{peakMode ? ' — tap to remove' : ''}</title>
                  </g>
                );
              })}
              {!rateUI && <LinesOverlay jump lines={jumps} w={size.w} h={size.h} selected={selJump} onSelect={drawing && !peakMode && !outletMode && !inlineMode && !roofMode ? (i) => { setSel(-1); setSelJump(i); setJumpMode(true); setRoofMode(false); } : feetUI ? (i) => { setSel(-1); setSelJump(i); } : undefined} onHandle={drawing ? onJumpHandle : undefined} ppx={ppx} bare={!feetUI} tagAt={tagJumps} />}
              {!rateUI && <OutletMarks outlets={outlets} w={size.w} h={size.h} onDown={outletMode ? (e, i) => { svgRef.current.setPointerCapture(e.pointerId); setDragPlug({ i, moved: false }); } : undefined} />}
              {!rateUI && <OutletMarks inline outlets={inlines} w={size.w} h={size.h} onDown={inlineMode ? (e, i) => { svgRef.current.setPointerCapture(e.pointerId); setDragPlug({ i, moved: false, inline: true }); } : undefined} />}
              {ruler && <line x1={ruler.a.x} y1={ruler.a.y} x2={ruler.b.x} y2={ruler.b.y} stroke="#fff" strokeWidth={Math.max(2, Math.round(Math.max(size.w, size.h) / 450))} strokeDasharray="6 6" strokeLinecap="round" />}
              {draft && <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke={scaleMode || jumpMode || !measuring ? '#fff' : LEVEL_COLOR[level]} strokeWidth={Math.max(2, Math.round(Math.max(size.w, size.h) / 450))} strokeDasharray="12 8" strokeLinecap="round" />}
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

    </div>
  );
}
